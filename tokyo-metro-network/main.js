const width = window.innerWidth;
const height = window.innerHeight;

const svg = d3.select("body").append("svg")
  .attr("width", width)
  .attr("height", height);

Promise.all([
  fetch("data/Node_metro.json").then(d => d.json()),
  fetch("data/Edge_metro.json").then(d => d.json())
]).then(([nodeData, edgeData]) => {
    // 地理座標の範囲から SVG 座標にマッピング
    const xScale = d3.scaleLinear()
        .domain(d3.extent(nodeData.nodes, d => d.lon))
        .range([50, width - 50]);

    const yScale = d3.scaleLinear()
        .domain(d3.extent(nodeData.nodes, d => d.lat))
        .range([height - 50, 50]);

    const nodes = nodeData.nodes.map(d => ({
        id: d.id,
        x: xScale(d.lon),
        y: yScale(d.lat),
        passengers: d.passengers
    }));

  const nodeMap = new Map(nodes.map(d => [d.id, d]));

  // デバッグ用ログをここに追加！
  console.log('ノード一覧:', nodes);
  console.log('エッジ一覧:', edgeData.edges);

  // エッジの描画
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

    // ノードを描画
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
