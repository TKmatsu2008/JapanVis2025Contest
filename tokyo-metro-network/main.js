// SVGのサイズ設定（ウィンドウに合わせる）
const width = window.innerWidth;
const height = window.innerHeight;

// SVG要素をbodyに追加
const svg = d3.select("body").append("svg")
  .attr("width", width)
  .attr("height", height);

// 地図背景の表示切り替えチェックボックスの状態保存・反映
document.getElementById("toggleMap").addEventListener("change", (e) => {
  localStorage.setItem("showMap", e.target.checked);
  window.location.reload(); // チェック状態変更後にページを再読み込み
});

// チェックボックスの状態を取得（初期値：true）
const showMap = localStorage.getItem("showMap") !== "false";

// JSONデータ（駅ノード・駅間エッジ）＋ 地図背景（条件付き）を読み込む
Promise.all([
  fetch("data/Node_metro.json").then(d => d.json()),
  fetch("data/Edge_metro.json").then(d => d.json()),
  showMap ? d3.json("https://raw.githubusercontent.com/dataofjapan/land/master/japan.geojson") : Promise.resolve(null)
]).then(([nodeData, edgeData, geoData]) => {
  // 駅の緯度経度から表示範囲を計算
  const longitudes = nodeData.nodes.map(d => d.lon);
  const latitudes = nodeData.nodes.map(d => d.lat);
  const lonExtent = d3.extent(longitudes);
  const latExtent = d3.extent(latitudes);

  // 地図投影を作成（中心位置とスケールをあとで調整）
  const projection = d3.geoMercator()
    .center([
      (lonExtent[0] + lonExtent[1]) / 2,
      (latExtent[0] + latExtent[1]) / 2
    ])
    .translate([width / 2, height / 2])
    .scale(1); // 仮スケールで初期化

  const path = d3.geoPath().projection(projection);

  // 表示範囲からスケールを自動調整
  const projectedMin = projection([lonExtent[0], latExtent[0]]);
  const projectedMax = projection([lonExtent[1], latExtent[1]]);
  const dx = projectedMax[0] - projectedMin[0];
  const dy = projectedMax[1] - projectedMin[1];
  const scale = 0.95 / Math.max(dx / width, dy / height); // 少し余白を持たせる
  projection.scale(scale);

  // ✅ 地図背景を表示（チェックがONの場合）
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

  // ✅ 駅ネットワークを描画
  renderNetwork(nodeData, edgeData, projection);
});

// 駅ネットワーク描画関数
function renderNetwork(nodeData, edgeData, projection) {
  // 各駅の座標を投影（画面XYに変換）
  const nodes = nodeData.nodes.map(d => {
    const [x, y] = projection([d.lon, d.lat]);
    return {
      id: d.id,
      x,
      y,
      passengers: d.passengers
    };
  });

  // 駅ID → 駅オブジェクトへのMapを作成（高速参照用）
  const nodeMap = new Map(nodes.map(d => [d.id, d]));

  // ✅ 駅間エッジ（路線）を描画
  svg.selectAll(".line")
    .data(edgeData.edges)
    .join("line")
    .attr("class", "line")
    .attr("x1", d => nodeMap.get(d.station_a)?.x)
    .attr("y1", d => nodeMap.get(d.station_a)?.y)
    .attr("x2", d => nodeMap.get(d.station_b)?.x)
    .attr("y2", d => nodeMap.get(d.station_b)?.y)
    .attr("stroke", d => d.line_color)
    .attr("stroke-width", d => Math.sqrt(d.count)) // 頻度に応じて太く
    .attr("stroke-linecap", "round")
    .attr("stroke-dasharray", "5 5") // アニメーションの初期状態
    .transition()
    .duration(2000)
    .ease(d3.easeSinInOut)
    .attr("stroke-dasharray", "20 5")
    .on("end", function repeat() {
      d3.select(this)
        .attr("stroke-dasharray", "5 5")
        .transition()
        .duration(2000)
        .ease(d3.easeSinInOut)
        .attr("stroke-dasharray", "20 5")
        .on("end", repeat); // 繰り返しアニメーション
    });

  // ✅ 駅ノードを描画
  svg.selectAll(".station")
    .data(nodes)
    .join("circle")
    .attr("class", "station")
    .attr("cx", d => d.x)
    .attr("cy", d => d.y)
    .attr("r", d => Math.sqrt(d.passengers) / 150) // 乗降者数に応じたサイズ
    .attr("fill", "steelblue")
    .append("title")
    .text(d => d.id); // ホバー時に駅名表示

  // ✅ 主要駅（乗降者数上位20）のラベル表示
  const topStations = nodes
    .slice()
    .sort((a, b) => b.passengers - a.passengers)
    .slice(0, 20);

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
