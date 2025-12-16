// 東京メトロ ネットワーク可視化 - 太さの差を調整可能にした点線アニメーション版

const width = window.innerWidth;
const height = window.innerHeight;
const BASE_ANIMATION_TIME = 500;
const DASH_SOLID = 20;//線の長さ
const DASH_GAP = 100;//線の間隔
const FLOW_DISTANCE = 50;//1回の移動量(固定で良い)
// const MIN_WIDTH = 0.5;
// const MAX_WIDTH = 3.5;
const MIN_WIDTH = 3.0;
const MAX_WIDTH = 8.0;
const MIN_SPEED = 1200;
const MAX_SPEED = 2000;
const NODE_SIZE = 200;
const TIME_SLOT_GROUPS = [
  { label: "早朝", hours: ["04", "05", "06"] },
];

// 共通保持：全マップで同期用の中心とズーム
let globalCenter = [139.76, 35.68];
let globalZoom = 12;
let syncing = false;
const allMaps = [];

Promise.all([
  fetch("data/Node_metro_toei.json").then(res => res.json()),
  fetch("data/Edge_metro_toei_fulltime.json").then(res => res.json())
]).then(([nodeData, edgeData]) => {
  // 単一ビューのみを表示する：最初のグループ（早朝）を使用
  const group = TIME_SLOT_GROUPS[0];
  setupMapView(`map-${group.label}`, group.label, group.hours, nodeData, edgeData);
});

function setupMapView(containerId, label, selectedHours, nodeData, edgeData) {
  // Leafletマップの初期化
  // Leafletは [lat, lon] の順序
  const map = L.map(containerId, {
    center: [globalCenter[1], globalCenter[0]],
    zoom: globalZoom,
    zoomControl: false // 必要に応じてコントロールを非表示
  });

  // OpenStreetMapのタイルレイヤーを追加
  // 暗めの地図にしたい場合はCartoDB DarkMatterなどもおすすめですが、ここでは標準OSMを使用し後述のフィルタで暗くします
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  allMaps.push(map);

  // Leaflet標準のSVGレイヤーを使用（ズーム・パンのアニメーションに同期するため）
  L.svg({ clickable: true }).addTo(map);

  // Leafletが作成したSVG要素を選択（overlayPane内に生成されます）
  const svg = d3.select(map.getPane('overlayPane')).select('svg')
    .style("pointer-events", "auto"); // インタラクションを有効化

  const g = svg.append("g");

  // 描画実行（svgではなくgに対して描画します）
  renderSingleView(map, g, nodeData, edgeData, selectedHours);
  
  // マップ明るさアニメーションを開始
  startBrightnessAnimation(map);

  map.on("move", () => {
    if (syncing) return;
    syncing = true;
  
    const center = map.getCenter();
    const zoom = map.getZoom();
  
    allMaps.forEach(otherMap => {
      if (otherMap !== map) {
        otherMap.setView(center, zoom, { animate: false });
      }
    });
  
    setTimeout(() => syncing = false, 20);
  });
}

function project(map, lon, lat) {
  // Leaflet: lat, lon -> layer point (地図レイヤー上の座標)
  // L.svg()を使う場合はこちらを使用することで、地図の移動に自動追従します
  const point = map.latLngToLayerPoint(new L.LatLng(lat, lon));
  return [point.x, point.y];
}

function averageFromHours(obj, hours) {
  const values = hours.map(h => obj?.[h]).filter(v => typeof v === 'number');
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function renderSingleView(map, svg, nodeData, edgeData, selectedHours) {
  const filteredEdges = edgeData.edges.filter(d => {
    const fwd = averageFromHours(d.count_by_hour, selectedHours) || 0;
    const rev = averageFromHours(
      edgeData.edges.find(e => e.station_a === d.station_b && e.station_b === d.station_a)?.count_by_hour,
      selectedHours
    ) || 0;
    return fwd + rev > 0;
  });

  const allCounts = edgeData.edges.map(d => {
    const allHours = Object.keys(d.count_by_hour || {});
    const fwd = averageFromHours(d.count_by_hour, allHours) || 0;
    const rev = averageFromHours(
      edgeData.edges.find(e => e.station_a === d.station_b && e.station_b === d.station_a)?.count_by_hour,
      allHours
    ) || 0;
    return fwd + rev;
  });

  const allDurations = edgeData.edges.map(d => {
    const allHours = Object.keys(d.average_time_by_hour || {});
    return averageFromHours(d.average_time_by_hour, allHours);
  }).filter(v => typeof v === 'number');

  const widthScale = d3.scaleLinear().domain(d3.extent(allCounts)).range([MIN_WIDTH, MAX_WIDTH]);
  const speedScale = d3.scaleLinear().domain(d3.extent(allCounts)).range([MAX_SPEED , MIN_SPEED]);

  const lines = svg.selectAll(".line")
    .data(filteredEdges)
    .join("line")
    .attr("class", "line")
    .attr("stroke", d => d.line_color)
    .attr("stroke-width", d => {
      const fwd = averageFromHours(d.count_by_hour, selectedHours) || 0;
      const rev = averageFromHours(
        edgeData.edges.find(e => e.station_a === d.station_b && e.station_b === d.station_a)?.count_by_hour,
        selectedHours
      ) || 0;
      return widthScale(fwd + rev);
    })
    .attr("stroke-linecap", "round")
    .attr("stroke-dasharray", `${DASH_SOLID} ${DASH_GAP}`)
    .attr("stroke-opacity", 0.7)
    .each(function animate(d) {
      const fwd = averageFromHours(d.count_by_hour, selectedHours) || 0;
      const rev = averageFromHours(
        edgeData.edges.find(e => e.station_a === d.station_b && e.station_b === d.station_a)?.count_by_hour,
        selectedHours
      ) || 0;
      const freq = fwd+rev; 
      const duration = speedScale(freq);
      const move = FLOW_DISTANCE;
      let offset = -Math.random() * move;
      const line = d3.select(this);
      line.attr("stroke-dashoffset", offset);
      (function repeat() {
        offset -= move;
        line.transition()
          .duration(duration)
          .ease(d3.easeLinear)
          .attr("stroke-dashoffset", offset)
          .on("end", repeat);
      })();
    });

  const circles = svg.selectAll(".station")
    .data(nodeData.nodes)
    .join("circle")
    .attr("class", "station")
    .attr("r", d => Math.max(Math.sqrt(d.passengers || 1000) / NODE_SIZE, 2))
    .attr("fill", "steelblue")
    .attr("stroke", "#aaa")
    .attr("stroke-width", 0.3)
    .attr("fill-opacity", 0.9)
    .attr("stroke-opacity", 0.7)
    .attr("cx", d => project(map, d.lon, d.lat)[0])
    .attr("cy", d => project(map, d.lon, d.lat)[1]);

  circles.append("title").text(d => d.id);

  function updatePositions() {
    const nodeMap = new Map(nodeData.nodes.map(d => [d.id, [d.lon, d.lat]]));
    lines
      .attr("x1", d => project(map, ...nodeMap.get(d.station_a))[0])
      .attr("y1", d => project(map, ...nodeMap.get(d.station_a))[1])
      .attr("x2", d => project(map, ...nodeMap.get(d.station_b))[0])
      .attr("y2", d => project(map, ...nodeMap.get(d.station_b))[1]);

    circles
      .attr("cx", d => project(map, d.lon, d.lat)[0])
      .attr("cy", d => project(map, d.lon, d.lat)[1]);
  }

  updatePositions();
  // パン（移動）はLeafletが自動処理するため再計算不要
  // ズーム終了時のみ再計算してサイズ等を調整
  map.on("zoomend", updatePositions);
}

// --- Brightness animation for time-of-day effect ---
// Brightness range: NIGHT .. DAY
// Increase BRIGHTNESS_DAY to make daytime brighter. Values >1 increase exposure; >1.8 may look oversaturated.
const BRIGHTNESS_DAY = 1.6; // peak brightness (was 1.2)
const BRIGHTNESS_NIGHT = 0.6; // darkest
let _brightnessTimers = new Map();

function hourToBrightness(hour) {
  // smooth day/night curve: peak near midday, low at midnight
  const x = (hour - 12) / 12 * Math.PI; // -pi..pi
  const v = Math.max(0, Math.cos(x)); // 1 at midday, 0 at midnight/opposite
  return BRIGHTNESS_NIGHT + (BRIGHTNESS_DAY - BRIGHTNESS_NIGHT) * v;
}

/**
 * Start brightness animation.
 * options.startHour: integer 0-23 (default 3)
 * options.stepMs: milliseconds per simulated minute (default 1000 -> 1s = 1min)
 */
function startBrightnessAnimation(map, options = {}) {
  const stepMs = options.stepMs || 30; // 1 second == 1 simulated minute
  const minutesPerDay = 24 * 60; // 1440
  let currentMinute = (typeof options.startHour === 'number' ? options.startHour : 3) * 60; // default 03:00

  // ensure we don't start twice for same map
  if (_brightnessTimers.has(map)) return;

  ensureBrightnessControls();

  // prepare canvas transition to make changes smooth
  try {
    // Leafletではタイルが表示されているペインを取得
    const tilePane = map.getPane('tilePane');
    const transMs = Math.max(80, Math.floor(stepMs * 0.85));
    if (tilePane && tilePane.style) {
      tilePane.style.transition = `filter ${transMs}ms linear`;
      // set initial brightness immediately
      const initHourFloat = currentMinute / 60;
      const initB = hourToBrightness(initHourFloat);
      tilePane.style.filter = `brightness(${initB})`;
      // set initial time display
      const initHour = Math.floor(initHourFloat);
      const initMinute = currentMinute % 60;
      const disp = document.getElementById('brightness-time');
      if (disp) disp.textContent = `時刻: ${String(initHour).padStart(2,'0')}:${String(initMinute).padStart(2,'0')}`;
    }
  } catch (e) { /* ignore */ }

  const timerId = setInterval(() => {
    // advance by 1 simulated minute per tick
    currentMinute = (currentMinute + 1) % minutesPerDay;
    const hourFloat = currentMinute / 60;
    const hour = Math.floor(hourFloat);
    const minute = currentMinute % 60;
    const b = hourToBrightness(hourFloat);

    try {
      const tilePane = map.getPane('tilePane');
      if (tilePane && tilePane.style) tilePane.style.filter = `brightness(${b})`;
    } catch (e) {
      // ignore
    }

    // update control display
    const disp = document.getElementById('brightness-time');
    if (disp) disp.textContent = `時刻: ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;

    // persist current minute to timer record if present
    const rec = _brightnessTimers.get(map);
    if (rec) rec.currentMinute = currentMinute;
  }, stepMs);

  _brightnessTimers.set(map, { id: timerId, stepMs, currentMinute });
  setBrightnessControlState(true);
}

function stopBrightnessAnimation(map) {
  const entry = _brightnessTimers.get(map);
  if (entry && entry.id) {
    clearInterval(entry.id);
    _brightnessTimers.delete(map);
  }
  setBrightnessControlState(false);
}

function ensureBrightnessControls() {
  if (document.getElementById('brightness-controls')) return;
  const container = document.createElement('div');
  container.id = 'brightness-controls';
  container.style.position = 'fixed';
  container.style.left = '8px';
  container.style.bottom = '8px';
  container.style.zIndex = 10000;
  container.style.background = 'rgba(255,255,255,0.9)';
  container.style.padding = '6px 8px';
  container.style.borderRadius = '6px';
  container.style.fontSize = '13px';
  container.style.display = 'flex';
  container.style.gap = '8px';
  container.style.alignItems = 'center';

  const btn = document.createElement('button');
  btn.id = 'brightness-toggle';
  btn.textContent = '再生';
  btn.onclick = () => {
    const map = allMaps[0];
    if (!map) return;
    if (_brightnessTimers.has(map)) stopBrightnessAnimation(map);
    else startBrightnessAnimation(map, { startHour: 3, stepMs: 1000 });
  };

  const time = document.createElement('div');
  time.id = 'brightness-time';
  time.textContent = '時刻: --:--';

  container.appendChild(btn);
  container.appendChild(time);
  document.body.appendChild(container);
}

function setBrightnessControlState(running) {
  const btn = document.getElementById('brightness-toggle');
  if (btn) {
    btn.style.background = running ? '#e06' : '';
    btn.textContent = running ? '停止' : '再生';
  }
}