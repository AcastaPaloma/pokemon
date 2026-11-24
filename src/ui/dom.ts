// Small DOM helpers and the shared SVG ink filters every brushed element uses.
import { ELEMENTS } from '../data/elements';
import { ELEMENT_INK } from '../render/palette';
import type { ElementId } from '../data/types';

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Inject the turbulence filters that roughen straight CSS shapes into brush marks. */
export function installInkFilters() {
  if (document.getElementById('ink-defs')) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'ink-defs';
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.innerHTML = `
    <defs>
      <filter id="rough" x="-5%" y="-30%" width="110%" height="160%">
        <feTurbulence type="fractalNoise" baseFrequency="0.035 0.3" numOctaves="2" seed="4" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
      <filter id="rough-soft" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="9" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
    </defs>`;
  document.body.appendChild(svg);
}

/** An element as a small coloured seal with its character and name. */
export function elementTag(id: ElementId, withName = true): string {
  const e = ELEMENTS[id];
  return `<span class="el" style="--c:${ELEMENT_INK[id]}"><span class="hanko">${e.kanji}</span>${withName ? e.name : ''}</span>`;
}

/** A move diamond. */
export function sealHtml(kanji: string, color = '', cls = ''): string {
  const k = [...kanji].slice(0, 2).join('');
  return `<div class="seal ${cls}" ${color ? `style="--c:${color}"` : ''}><span style="${[...k].length > 1 ? 'font-size:0.72em;letter-spacing:0' : ''}">${k}</span></div>`;
}

/** First character of a caption, for compact seals. */
export const firstChar = (s: string) => [...s][0] ?? '';

export function fmtTime(sec: number): string {
  const h2 = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h2 > 0 ? `${h2}h ${m}m` : `${m}m`;
}
