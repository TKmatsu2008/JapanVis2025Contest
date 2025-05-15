# %%
import requests
import json
import pandas as pd
from datetime import datetime
from collections import defaultdict, Counter

# APIキーを設定
API_KEY = "58npykl0u0d8q97dycloymy2krwz2vouz6jxte3gmzkwr0feoifqbe644znnxykx"

# %%
TARGET_HOUR = 8 # 時間帯指定
TARGET_CALENDAR = "Weekday" # 曜日指定

# %% [markdown]
# ### ノード情報の取得と構築
# 駅名, 路線コードリスト[], 路線リスト[], 緯度, 経度, 1日の平均乗降者数(最新年度)

# %%
station_url = "https://api.odpt.org/api/v4/odpt:Station" # 駅情報API
survey_url = "https://api.odpt.org/api/v4/odpt:PassengerSurvey" # 乗降者数API
params = { # APIパラメータ共通部分
    "odpt:operator": "odpt.Operator:TokyoMetro",
    "acl:consumerKey": API_KEY
}

# 駅データと乗降者数データを取得
station_data = requests.get(station_url, params=params).json()
survey_data = requests.get(survey_url, params=params).json()

# URIから末尾ID（例：TokyoMetro.Ginza.Ueno）を抽出する関数
def get_station_key(uri):
    return uri.split(":")[-1]

# 利用可能な最新年を取得
all_years = [s.get("odpt:surveyYear")
             for item in survey_data
             for s in item.get("odpt:passengerSurveyObject", [])
             if s.get("odpt:surveyYear")]
latest_year = max(all_years)

# 駅ID（URI末尾）から乗降者数を格納
passenger_map = {}
for item in survey_data:
    uris = item.get("odpt:station", [])
    for s in item.get("odpt:passengerSurveyObject", []):
        if s.get("odpt:surveyYear") == latest_year:
            journeys = s.get("odpt:passengerJourneys")
            for uri in uris:
                key = get_station_key(uri)
                passenger_map[key] = journeys

# ノード情報の構築（複数路線がある場合、駅名で統合）
station_map = {}
for s in station_data:
    name = s.get("dc:title") # 駅名（日本語）
    same_as = s.get("owl:sameAs", "") # 一意なURI
    key = get_station_key(same_as) # 駅ID（URI末尾）
    base_code = s.get("odpt:stationCode", "") # 駅コード（例：G16）
    railways = s.get("odpt:railway") # 所属路線（複数可）
    lat = s.get("geo:lat") # 緯度
    lon = s.get("geo:long") # 経度
    journeys = passenger_map.get(key, 0) # 乗降者数

    # railways が文字列の場合、リストに変換して一律に扱う
    if isinstance(railways, str):
        railways = [railways]
        
    # 路線名（例："TokyoMetro.Ginza" → "Ginza"）を抽出
    lines = [r.split(":")[-1].replace("TokyoMetro.", "") for r in railways]
    
    # 駅コードのリスト作成
    codes = [line[0].upper() + base_code[1:] for line in lines if base_code[1:].isdigit()]

    if name not in station_map: # 駅名で統合（同名駅で複数路線がある場合）
        station_map[name] = {
            "id": name,
            "codes": codes,
            "lines": lines,
            "lat": lat,
            "lon": lon,
            "passengers": journeys
        }
    else: # 既に登録済みの駅ならコード・路線を統合、乗降者数は加算
        station_map[name]["codes"].extend(codes)
        station_map[name]["lines"].extend(lines)
        station_map[name]["codes"] = list(set(station_map[name]["codes"]))
        station_map[name]["lines"] = list(set(station_map[name]["lines"]))
        station_map[name]["passengers"] += journeys

# メタデータと統合
nodes = list(station_map.values())
output_data = {
    "metadata": {
        "generated_at": datetime.now().isoformat(),
        "passenger_survey_year": latest_year
    },
    "nodes": nodes
}

# JSONで保存
with open("Node_metro.json", "w", encoding="utf-8") as f:
    json.dump(output_data, f, ensure_ascii=False, indent=2)

# %% [markdown]
# ### エッジ情報の取得と構築
# - 駅名A(始点), 駅名B(終点), 路線名, 路線カラー, 平均移動時間, 頻度, 出発時間[]
#     - ローカルのみ（快速等は除外）
#     - 上り下り区別可

# %%
station_url = "https://api.odpt.org/api/v4/odpt:Station" # 駅情報API
railway_url = "https://api.odpt.org/api/v4/odpt:Railway" # 鉄道路線情報API
params = { # APIパラメータ共通部分
    "odpt:operator": "odpt.Operator:TokyoMetro",
    "acl:consumerKey": API_KEY
}
# 駅データと鉄道路線データを取得
station_data = requests.get(station_url, params=params).json()
railways = requests.get(railway_url, params=params).json()

# 路線URI → 名称・カラーのマッピング辞書
railway_map = {
    r["owl:sameAs"]: {
        "name": r["owl:sameAs"].split(":")[-1].replace("TokyoMetro.", ""),
        "color": r.get("odpt:color")
    } for r in railways
}

# 駅名辞書を作成（URI末尾 → 駅名）
station_id_to_name = {
    s["owl:sameAs"].split(":")[-1]: s["dc:title"] for s in station_data
}

# URIから駅名（日本語）を取り出す関数
def extract_station_name(uri):
    key = uri.split(":")[-1] if uri else None
    return station_id_to_name.get(key, key)

# 各路線の発行日記録辞書
railway_issue_dates = {}

# 時刻表データの発行日時一覧を収集 ---
issue_dates = [
    t.get("dct:issued") or t.get("dc:date")
    for r in railway_map.keys()
    for t in requests.get(
        "https://api.odpt.org/api/v4/odpt:TrainTimetable",
        params={
            "odpt:operator": "odpt.Operator:TokyoMetro",
            "odpt:railway": r,
            "odpt:calendar": f"odpt.Calendar:{TARGET_CALENDAR}",
            "acl:consumerKey": API_KEY
        }
    ).json()
    if "dct:issued" in t or "dc:date" in t
]

# エッジ情報の収集・集計
all_edges = []
for railway_uri, info in railway_map.items():
    # TrainTimetable API 呼び出し（路線・カレンダー指定）
    params_tt = {
        "odpt:operator": "odpt.Operator:TokyoMetro",
        "odpt:railway": railway_uri,
        "odpt:calendar": f"odpt.Calendar:{TARGET_CALENDAR}",
        "acl:consumerKey": API_KEY
    }
    timetables = requests.get("https://api.odpt.org/api/v4/odpt:TrainTimetable", params=params_tt).json()

    # 発行日（dct:issued か dc:date）の最も新しい日付を記録
    issue_list = [t.get("dct:issued") or t.get("dc:date") for t in timetables if t.get("dct:issued") or t.get("dc:date")]
    if issue_list:
        latest = max(issue_list)
        earliest = min(issue_list)
        railway_issue_dates[info["name"]] = {
            "latest_issued": latest,
            "earliest_issued": earliest
        }
    
    # 駅ペアごとの移動時間・出発時刻リスト
    travel_time_dict = defaultdict(list)
    departure_time_dict = defaultdict(list)

    for train in timetables:
        if train.get("odpt:trainType") != "odpt.TrainType:TokyoMetro.Local": # 各駅停車（Local）のみを対象
            continue

        stops = train.get("odpt:trainTimetableObject", [])
        departures = [
            (extract_station_name(s.get("odpt:departureStation")), s.get("odpt:departureTime"))
            for s in stops
            if "odpt:departureStation" in s and "odpt:departureTime" in s
        ]
        
        # 駅が1つしかなければスキップ
        if len(departures) < 2:
            continue
            
        # 通常の駅間（出発→出発）で移動時間を計算
        for i in range(len(departures) - 1):
            station_a, time_a = departures[i]
            station_b, time_b = departures[i + 1]
            try:
                dt1 = datetime.strptime(time_a, "%H:%M")
                dt2 = datetime.strptime(time_b, "%H:%M")
                if dt1.hour == TARGET_HOUR:
                    diff = (dt2 - dt1).seconds // 60
                    if 0 < diff <= 10:
                        key = (station_a, station_b)
                        travel_time_dict[key].append(diff)
                        departure_time_dict[key].append(time_a)
            except:
                continue
                
        # 最後の駅（到着のみ）処理
        if "odpt:arrivalTime" in stops[-1] and "odpt:arrivalStation" in stops[-1]:
            station_a, time_a = departures[-1]
            station_b = extract_station_name(stops[-1]["odpt:arrivalStation"])
            time_b = stops[-1]["odpt:arrivalTime"]
            try:
                dt1 = datetime.strptime(time_a, "%H:%M")
                dt2 = datetime.strptime(time_b, "%H:%M")
                if dt1.hour == TARGET_HOUR:
                    diff = (dt2 - dt1).seconds // 60
                    if 0 < diff <= 10:
                        key = (station_a, station_b)
                        travel_time_dict[key].append(diff)
                        departure_time_dict[key].append(time_a)
            except:
                continue
                
    # 駅ペアごとに集計してエッジとして記録
    for (station_a, station_b), times in travel_time_dict.items():
        if not times:
            continue
        avg = round(sum(times) / len(times), 1) # 平均移動時間（分）
        departure_times = sorted(
            departure_time_dict[(station_a, station_b)],
            key=lambda t: datetime.strptime(t, "%H:%M")
        )
        all_edges.append({
            "station_a": station_a,
            "station_b": station_b,
            "line": info["name"],
            "line_color": info["color"],
            "average_time": avg,
            "count": len(times),
            "departure_times": departure_times
        })

# メタデータと統合
output_data = {
    "metadata": {
        "generated_at": datetime.now().isoformat(),
        "target_hour": TARGET_HOUR,
        "calendar": TARGET_CALENDAR,
        "railway_issued_dates": railway_issue_dates
    },
    "edges": all_edges
}

# JSONで保存
with open("Edge_metro.json", "w", encoding="utf-8") as f:
    json.dump(output_data, f, ensure_ascii=False, indent=2)

# %%



