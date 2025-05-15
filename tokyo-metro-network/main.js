const width = window.innerWidth;
const height = window.innerHeight;
const svg = d3.select("body").append("svg")
  .attr("width", width)
  .attr("height", height);

// ✅ チェック切替でlocalStorage保存＋リロード
document.getElementById("toggleMap").addEventListener("change", (e) => {
  localStorage.setItem("showMap", e.target.checked);
  window.location.reload();
});

// ✅ 保存された状態を読み込む（デフォルト true）
const showMap = localStorage.getItem("showMap") !== "false";

// 地理投影
const projection = d3.geoMercator()
  .center([139.75, 35.68])  // 東京中心
  .scale(50000)
  .translate([width / 2, height / 2]);

const path = d3.geoPath().projection(projection);

// 共通のネットワーク描画関数
function renderNetwork() {
  Promise.all([
    fetch("data/Node_metro.json").then(d => d.json()),
    fetch("data/Edge_metro.json").then(d => d.json())
  ]).then(([nodeData, edgeData]) => {
    const nodes = nodeData.nodes.map(d => {
      const [x, y] = projection([d.lon, d.lat]);
      return {
        id: d.id,
        x,
        y,
        passengers: d.passengers
      };
    });

    const nodeMap = new Map(nodes.map(d => [d.id, d]));

    // エッジ（路線）
    svg.selectAll(".line")
      .data(edgeData.edges)
      .join("line")
      .attr("class", "line")
      .attr("x1", d => nodeMap.get(d.station_a)?.x)
      .attr("y1", d => nodeMap.get(d.station_a)?.y)
      .attr("x2", d => nodeMap.get(d.station_b)?.x)
      .attr("y2", d => nodeMap.get(d.station_b)?.y)
      .attr("stroke", d => d.line_color)
      .attr("stroke-width", d => Math.sqrt(d.count))
      .attr("stroke-linecap", "round")
      .attr("stroke-dasharray", "5 5")
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
          .on("end", repeat);
      });

    // 駅ノード
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
  });
}

// ✅ 地図背景（あり／なし）に応じて描画
if (showMap) {
  d3.json("https://raw.githubusercontent.com/dataofjapan/land/master/japan.geojson").then(geoData => {
    svg.append("g")
      .attr("class", "background-map")
      .selectAll("path")
      .data(geoData.features)
      .join("path")
      .attr("d", path)
      .attr("fill", "#f1f1f1")
      .attr("stroke", "#aaa");

    renderNetwork(); // 地図のあとにネットワーク描画
  });
} else {
  renderNetwork(); // 地図なしで即描画
}
