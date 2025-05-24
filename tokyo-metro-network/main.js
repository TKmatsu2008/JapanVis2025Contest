// 東京メトロ ネットワーク可視化 - 太さの差を調整可能にした点線アニメーション版

const width = window.innerWidth;
const height = window.innerHeight;
const BASE_ANIMATION_TIME = 1000; // 1分あたりの基準時間（ms）
const DASH_SOLID = 8;  // 点線の線の長さ
const DASH_GAP = 12;   // 点線の間隔
const FLOW_DISTANCE = 100; // 一度に流す距離（点線の動き量）
const MIN_WIDTH = 0.1; // エッジの最小太さ
const MAX_WIDTH = 10; // エッジの最大太さ

const svg = d3.select("body").append("svg")
  .attr("width", width)
  .attr("height", height);

document.getElementById("toggleMap").addEventListener("change", (e) => {
  localStorage.setItem("showMap", e.target.checked);
  window.location.reload();
});

const showMap = localStorage.getItem("showMap") !== "false";

Promise.all([
  fetch("data/Node_metro_toei.json").then(d => d.json()),
  fetch("data/Edge_metro_toei_fulltime.json").then(d => d.json()),
  showMap ? d3.json("https://raw.githubusercontent.com/dataofjapan/land/master/japan.geojson") : Promise.resolve(null)
]).then(([nodeData, edgeData, geoData]) => {
  const longitudes = nodeData.nodes.map(d => d.lon);
  const latitudes = nodeData.nodes.map(d => d.lat);
  const lonExtent = d3.extent(longitudes);
  const latExtent = d3.extent(latitudes);

  const projection = d3.geoMercator()
    .center([(lonExtent[0] + lonExtent[1]) / 2, (latExtent[0] + latExtent[1]) / 2])
    .translate([width / 2, height / 2])
    .scale(1);

  const path = d3.geoPath().projection(projection);
  const projectedMin = projection([lonExtent[0], latExtent[0]]);
  const projectedMax = projection([lonExtent[1], latExtent[1]]);
  const dx = projectedMax[0] - projectedMin[0];
  const dy = projectedMax[1] - projectedMin[1];
  const scale = 0.95 / Math.max(dx / width, dy / height);
  projection.scale(scale);

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

  renderNetwork(nodeData, edgeData, projection);
});

function renderNetwork(nodeData, edgeData, projection) {
  const nodes = nodeData.nodes.map(d => {
    const [x, y] = projection([d.lon, d.lat]);
    return { id: d.id, x, y, passengers: d.passengers };
  });

  const nodeMap = new Map(nodes.map(d => [d.id, d]));

  // --- エッジ太さスケーリング設定 ---
  // 駅間の往復本数（countA→B + countB→A）を取得
  const edgeCounts = edgeData.edges.map(d => {
    const forward = d.count || 0;
    const reverse = edgeData.edges.find(e => e.station_a === d.station_b && e.station_b === d.station_a)?.count || 0;
    return forward + reverse;
  });

  // エッジ本数の最小〜最大を取得しスケーリング関数を定義
  const countExtent = d3.extent(edgeCounts);
  const widthScale = d3.scaleLinear()
    .domain(countExtent)
    .range([MIN_WIDTH, MAX_WIDTH]);

  // --- エッジ（路線）描画とアニメーション ---
  svg.selectAll(".line")
    .data(edgeData.edges)
    .join("line")
    .attr("class", "line")
    .attr("x1", d => nodeMap.get(d.station_a)?.x)
    .attr("y1", d => nodeMap.get(d.station_a)?.y)
    .attr("x2", d => nodeMap.get(d.station_b)?.x)
    .attr("y2", d => nodeMap.get(d.station_b)?.y)
    .attr("stroke", d => d.line_color)
    // 太さを本数に応じてスケール変換
    .attr("stroke-width", d => {
      const forward = d.count || 0;
      const reverse = edgeData.edges.find(e => e.station_a === d.station_b && e.station_b === d.station_a)?.count || 0;
      return widthScale(forward + reverse);
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
