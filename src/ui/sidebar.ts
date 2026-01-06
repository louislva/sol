import { type CelestialBody, getBodyPosition } from '../astronomy/bodies';
import { AU_KM, julianToDate } from '../astronomy/constants';

const sidebar = document.getElementById('sidebar')!;
const sidebarContent = document.getElementById('sidebar-content')!;
const closeBtn = document.getElementById('sidebar-close')!;

let selectedBody: CelestialBody | null = null;
let onCloseCallback: (() => void) | null = null;

// Close button handler
closeBtn.addEventListener('click', () => {
  hide();
  if (onCloseCallback) onCloseCallback();
});

// Note: Click-to-close is handled by main.ts click handler
// when clicking on empty space (no body under cursor)

export function show(body: CelestialBody, julianDate: number): void {
  selectedBody = body;
  sidebar.classList.remove('hidden');
  update(julianDate);
}

export function hide(): void {
  selectedBody = null;
  sidebar.classList.add('hidden');
}

export function isVisible(): boolean {
  return !sidebar.classList.contains('hidden');
}

export function getSelectedBody(): CelestialBody | null {
  return selectedBody;
}

export function setOnClose(callback: () => void): void {
  onCloseCallback = callback;
}

export function update(julianDate: number): void {
  if (!selectedBody) return;

  const pos = getBodyPosition(selectedBody, julianDate);
  const distanceKm = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
  const distanceAU = distanceKm / AU_KM;

  let html = `
    <h2 style="color: ${selectedBody.color}">${selectedBody.name}</h2>
    <div class="sidebar-type">${formatBodyType(selectedBody.type)}</div>
    <div class="sidebar-section">
      <div class="sidebar-label">Radius</div>
      <div class="sidebar-value">${formatRadius(selectedBody.radius)}</div>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-label">Distance from Sun</div>
      <div class="sidebar-value">${formatDistance(distanceAU)}</div>
    </div>
  `;

  // Parent-specific info for moons
  if (selectedBody.parentName && selectedBody.parentName !== 'Sun') {
    html += `
      <div class="sidebar-section">
        <div class="sidebar-label">Orbits</div>
        <div class="sidebar-value">${selectedBody.parentName}</div>
      </div>
    `;
  }

  // Orbital elements for planets/dwarf planets
  if (selectedBody.elements) {
    const e = selectedBody.elements;
    html += `
      <div class="sidebar-divider"></div>
      <div class="sidebar-section-title">Orbital Elements</div>
      <div class="sidebar-section">
        <div class="sidebar-label">Semi-major axis</div>
        <div class="sidebar-value">${e.a.toFixed(3)} AU</div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-label">Eccentricity</div>
        <div class="sidebar-value">${e.e.toFixed(4)}</div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-label">Inclination</div>
        <div class="sidebar-value">${e.i.toFixed(2)}°</div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-label">Orbital period</div>
        <div class="sidebar-value">${formatOrbitalPeriod(e.a)}</div>
      </div>
    `;
  }

  // Parent-centric elements for moons
  if (selectedBody.parentCentricElements) {
    const e = selectedBody.parentCentricElements;
    html += `
      <div class="sidebar-divider"></div>
      <div class="sidebar-section-title">Orbital Elements</div>
      <div class="sidebar-section">
        <div class="sidebar-label">Semi-major axis</div>
        <div class="sidebar-value">${formatMoonDistance(e.a)}</div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-label">Eccentricity</div>
        <div class="sidebar-value">${e.e.toFixed(4)}</div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-label">Inclination</div>
        <div class="sidebar-value">${e.i.toFixed(2)}°</div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-label">Orbital period</div>
        <div class="sidebar-value">${formatMoonPeriod(360 / e.n)}</div>
      </div>
    `;
  }

  // Spacecraft-specific info
  if (selectedBody.type === 'probe') {
    html += `<div class="sidebar-divider"></div>`;

    if (selectedBody.missionStatus) {
      const statusColor = selectedBody.missionStatus === 'active' ? '#66ff66' :
                          selectedBody.missionStatus === 'ended' ? '#888888' : '#6666ff';
      html += `
        <div class="sidebar-section">
          <div class="sidebar-label">Status</div>
          <div class="sidebar-value" style="color: ${statusColor}">${capitalize(selectedBody.missionStatus)}</div>
        </div>
      `;
    }

    if (selectedBody.missionType) {
      html += `
        <div class="sidebar-section">
          <div class="sidebar-label">Mission type</div>
          <div class="sidebar-value">${formatMissionType(selectedBody.missionType)}</div>
        </div>
      `;
    }

    if (selectedBody.launchJD) {
      html += `
        <div class="sidebar-section">
          <div class="sidebar-label">Launch date</div>
          <div class="sidebar-value">${formatJulianDate(selectedBody.launchJD)}</div>
        </div>
      `;
    }

    if (selectedBody.endJD) {
      html += `
        <div class="sidebar-section">
          <div class="sidebar-label">End date</div>
          <div class="sidebar-value">${formatJulianDate(selectedBody.endJD)}</div>
        </div>
      `;
    }

    if (selectedBody.spkid) {
      html += `
        <div class="sidebar-section">
          <div class="sidebar-label">JPL ID</div>
          <div class="sidebar-value">${selectedBody.spkid}</div>
        </div>
      `;
    }
  }

  // Position coordinates
  html += `
    <div class="sidebar-divider"></div>
    <div class="sidebar-section-title">Current Position</div>
    <div class="sidebar-section">
      <div class="sidebar-label">X</div>
      <div class="sidebar-value">${(pos.x / AU_KM).toFixed(4)} AU</div>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-label">Y</div>
      <div class="sidebar-value">${(pos.y / AU_KM).toFixed(4)} AU</div>
    </div>
  `;

  sidebarContent.innerHTML = html;
}

function formatBodyType(type: string): string {
  const types: Record<string, string> = {
    star: 'Star',
    planet: 'Planet',
    dwarf: 'Dwarf Planet',
    moon: 'Moon',
    asteroid: 'Asteroid',
    comet: 'Comet',
    probe: 'Spacecraft',
  };
  return types[type] || type;
}

function formatRadius(km: number): string {
  if (km >= 1000) {
    return `${(km / 1000).toFixed(1)}k km`;
  }
  return `${km.toFixed(0)} km`;
}

function formatDistance(au: number): string {
  if (au < 0.01) {
    return `${(au * AU_KM).toFixed(0)} km`;
  }
  return `${au.toFixed(3)} AU`;
}

function formatMoonDistance(km: number): string {
  if (km >= 1000000) {
    return `${(km / 1000000).toFixed(2)}M km`;
  }
  if (km >= 1000) {
    return `${(km / 1000).toFixed(0)}k km`;
  }
  return `${km.toFixed(0)} km`;
}

function formatOrbitalPeriod(semiMajorAxisAU: number): string {
  // Kepler's third law: T^2 = a^3 (for Sun-orbiting bodies, T in years, a in AU)
  const periodYears = Math.pow(semiMajorAxisAU, 1.5);
  if (periodYears < 1) {
    return `${(periodYears * 365.25).toFixed(1)} days`;
  }
  if (periodYears < 2) {
    return `${periodYears.toFixed(2)} years`;
  }
  return `${periodYears.toFixed(1)} years`;
}

function formatMoonPeriod(days: number): string {
  if (days < 1) {
    return `${(days * 24).toFixed(1)} hours`;
  }
  if (days < 30) {
    return `${days.toFixed(2)} days`;
  }
  return `${(days / 30.44).toFixed(1)} months`;
}

function formatMissionType(type: string): string {
  const types: Record<string, string> = {
    deep_space: 'Deep Space',
    earth_orbiter: 'Earth Orbiter',
    planetary_orbiter: 'Planetary Orbiter',
    lander: 'Lander/Rover',
  };
  return types[type] || type;
}

function formatJulianDate(jd: number): string {
  const date = julianToDate(jd);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
