// ✅ 東京メトロ＋都営線ネットワーク可視化（全体が画面内に収まるよう調整済）

// ==== ファイル名・時間帯の設定 ====
const NODE_FILE = "data/Node_metro_toei.json";  // 駅ノードデータファイル
const EDGE_FILE = "data/Edge_metro_toei_fulltime.json";  // エッジデータファイル
const TIME_RANGE = [5, 10];  // 可視化対象の時間帯（例：5〜10時）

// ==== SVGサイズと描画設定 ====
const width = window.innerWidth;
const height = window.innerHeight;
const BASE_ANIMATION_TIME = 1000;  // アニメーション速度の基準（1分あたり）
const DASH_SOLID = 8;              // 点線の長さ
const DASH_GAP = 12;               // 点線の間隔
const FLOW_DISTANCE = 100;         // 点線が1回のループで流れる距離
const MIN_WIDTH = 1;               // エッジの最小太さ
const MAX_WIDTH = 6;               // エッジの最大太さ

// ==== SVG要素作成 ====
const svg = d3.select("body").append("svg")
  .attr("width", width)
  .attr("height", height);

// ==== 地図背景の表示切り替え ====
const showMap = localStorage.getItem("showMap") !== "false";
document.getElementById("toggleMap")?.addEventListener("change", (e) => {
  localStorage.setItem("showMap", e.target.checked);
  window.location.reload();
});

// ==== データ読み込み（駅、路線、地図） ====
Promise.all([
  fetch(NODE_FILE).then(d => d.json()),
  fetch(EDGE_FILE).then(d => d.json()),
  showMap ? d3.json("https://raw.githubusercontent.com/dataofjapan/land/master/japan.geojson") : Promise.resolve(null)
]).then(([nodeData, edgeData, geoData]) => {
  
  // ==== fitExtentで地図範囲を画面内に収めるためGeoJSONに変換 ====
  const nodeGeoJSON = {
    type: "FeatureCollection",
    features: nodeData.nodes.map(d => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [d.lon, d.lat] }
    }))
  };

  // ==== プロジェクション作成とfitExtentによる自動調整 ====
  const projection = d3.geoMercator()
    .fitExtent([[20, 20], [width - 20, height - 20]], nodeGeoJSON);  // 四辺に余白20px

  const path = d3.geoPath().projection(projection);

  // ==== 地図背景描画（表示ON時） ====
  if (showMap && geoData) {
    svg.append("g")
      .attr("class", "background-map")
      .selectAll("path")
      .data(geoData.features)
      .join("path")
      .attr("d", path)
      .attr("fill", "#f1f1f1")
      .attr("stroke", "#aaa");
  }

  // ==== 駅ネットワーク描画関数呼び出し ====
  renderNetwork(nodeData, edgeData, projection);
});

// ==== 駅ノードと路線エッジを描画する関数 ====
function renderNetwork(nodeData, edgeData, projection) {
  // ==== 駅座標の投影変換 ====
  const nodes = nodeData.nodes.map(d => {
    const [x, y] = projection([d.lon, d.lat]);
    return { id: d.id, x, y, passengers: d.passengers };
  });

  // ==== 駅IDからノード参照用のMapを作成 ====
  const nodeMap = new Map(nodes.map(d => [d.id, d]));

  // ==== 各路線の時間帯別頻度の合計を計算 ====
  const edgeFreqs = edgeData.edges.map(d => {
    const freqSum = Object.entries(d.count_by_hour || {})
      .filter(([h]) => +h >= TIME_RANGE[0] && +h <= TIME_RANGE[1])
      .reduce((sum, [, val]) => sum + (val || 0), 0);
    return freqSum;
  });

  // ==== 頻度に基づいてエッジの太さを線形スケール化 ====
  const freqExtent = d3.extent(edgeFreqs);
  const widthScale = d3.scaleLinear().domain(freqExtent).range([MIN_WIDTH, MAX_WIDTH]);

  // ==== エッジ描画とアニメーション設定 ====
  svg.selectAll(".line")
    .data(edgeData.edges)
    .join("line")
    .attr("class", "line")
    .attr("x1", d => nodeMap.get(d.station_a)?.x)
    .attr("y1", d => nodeMap.get(d.station_a)?.y)
    .attr("x2", d => nodeMap.get(d.station_b)?.x)
    .attr("y2", d => nodeMap.get(d.station_b)?.y)
    .attr("stroke", d => d.line_color)
    .attr("stroke-width", d => {
      const freq = Object.entries(d.count_by_hour || {})
        .filter(([h]) => +h >= TIME_RANGE[0] && +h <= TIME_RANGE[1])
        .reduce((sum, [, val]) => sum + (val || 0), 0);
      return widthScale(freq);
    })
    .attr("stroke-linecap", "round")
    .attr("stroke-dasharray", `${DASH_SOLID} ${DASH_GAP}`)
    .each(function animate(d) {
      const line = d3.select(this);
      const duration = (d.duration || 3) * BASE_ANIMATION_TIME;
      let offset = -Math.random() * FLOW_DISTANCE;
      line.attr("stroke-dashoffset", offset);
      (function repeat() {
        offset -= FLOW_DISTANCE;
        line
          .transition()
          .duration(duration)
          .ease(d3.easeLinear)
          .attr("stroke-dashoffset", offset)
          .on("end", repeat);
      })();
    });

  // ==== 駅ノード（円）を描画 ====
  svg.selectAll(".station")
    .data(nodes)
    .join("circle")
    .attr("class", "station")
    .attr("cx", d => d.x)
    .attr("cy", d => d.y)
    .attr("r", d => Math.sqrt(d.passengers) / 150)
    .attr("fill", "steelblue")
    .append("title")
    .text(d => d.id);

  // ==== 主要駅ラベル（乗降者数上位20駅） ====
  const topStations = nodes.slice().sort((a, b) => b.passengers - a.passengers).slice(0, 20);
  svg.selectAll(".station-label")
    .data(topStations)
    .join("text")
    .attr("class", "station-label")
    .attr("x", d => d.x + 6)
    .attr("y", d => d.y - 6)
    .text(d => d.id)
    .attr("font-size", "10px")
    .attr("fill", "#333");
}