/* Calendario de competencia/emissao */

class NfseCalendar {
  constructor(targetEl, options = {}) {
    this.target = typeof targetEl === 'string' ? document.getElementById(targetEl) : targetEl;
    this.onSelect = options.onSelect || (() => {});
    this.mode = options.mode || 'range'; // 'range' ou 'month'
    this.startDate = options.startDate || null;
    this.endDate = options.endDate || null;
    this.viewDate = new Date();
    this.selecting = false;
    this.popup = null;
    this._build();
  }

  _build() {
    this.container = document.createElement('div');
    this.container.className = 'cal-wrap';
    this.container.innerHTML = `
      <button class="cal-trigger" type="button">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3.5 0a.5.5 0 01.5.5V1h8V.5a.5.5 0 011 0V1h1.5A1.5 1.5 0 0116 2.5v11a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 010 13.5v-11A1.5 1.5 0 011.5 1H3V.5a.5.5 0 01.5-.5zM1.5 2a.5.5 0 00-.5.5V4h14V2.5a.5.5 0 00-.5-.5h-13zM15 5H1v8.5a.5.5 0 00.5.5h13a.5.5 0 00.5-.5V5z"/>
        </svg>
        <span class="cal-label">Selecione o periodo</span>
        <svg class="cal-chevron" width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6z" fill="currentColor"/></svg>
      </button>
    `;

    this.trigger = this.container.querySelector('.cal-trigger');
    this.label = this.container.querySelector('.cal-label');
    this.trigger.addEventListener('click', () => this._toggle());

    this.target.innerHTML = '';
    this.target.appendChild(this.container);

    document.addEventListener('click', (e) => {
      if (this.popup && !this.container.contains(e.target)) this._close();
    });

    this._updateLabel();
  }

  _toggle() {
    if (this.popup) { this._close(); return; }
    this._open();
  }

  _open() {
    this.popup = document.createElement('div');
    this.popup.className = 'cal-popup';
    this._render();
    this.container.appendChild(this.popup);
  }

  _close() {
    if (this.popup) { this.popup.remove(); this.popup = null; }
  }

  _render() {
    if (!this.popup) return;
    const y = this.viewDate.getFullYear();
    const m = this.viewDate.getMonth();

    if (this.mode === 'month') {
      this._renderMonthPicker(y);
    } else {
      this._renderDayPicker(y, m);
    }
  }

  _renderMonthPicker(year) {
    const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    let html = `
      <div class="cal-header">
        <button class="cal-nav" data-dir="-1">&lsaquo;</button>
        <span class="cal-title">${year}</span>
        <button class="cal-nav" data-dir="1">&rsaquo;</button>
      </div>
      <div class="cal-presets">
        <button class="cal-preset-btn" data-preset="ytd">Ano atual</button>
        <button class="cal-preset-btn" data-preset="last12">Ultimos 12 meses</button>
        <button class="cal-preset-btn" data-preset="last6">Ultimos 6 meses</button>
        <button class="cal-preset-btn" data-preset="last3">Ultimos 3 meses</button>
      </div>
      <div class="cal-months">
    `;

    for (let i = 0; i < 12; i++) {
      const d = new Date(year, i, 1);
      const comp = `${String(i+1).padStart(2,'0')}/${year}`;
      let cls = 'cal-month';
      if (this.startDate && this.endDate) {
        const sd = this.startDate, ed = this.endDate;
        const sdComp = `${String(sd.getMonth()+1).padStart(2,'0')}/${sd.getFullYear()}`;
        const edComp = `${String(ed.getMonth()+1).padStart(2,'0')}/${ed.getFullYear()}`;
        if (comp === sdComp) cls += ' start';
        if (comp === edComp) cls += ' end';
        if (d >= new Date(sd.getFullYear(), sd.getMonth(), 1) && d <= new Date(ed.getFullYear(), ed.getMonth(), 1)) {
          cls += ' in-range';
        }
      }
      if (d > new Date()) cls += ' future';
      html += `<button class="${cls}" data-month="${i}" data-year="${year}">${months[i]}</button>`;
    }

    html += '</div>';
    html += `<div class="cal-footer">
      <button class="cal-clear-btn">Limpar</button>
      <button class="cal-apply-btn">Aplicar</button>
    </div>`;

    this.popup.innerHTML = html;
    this._bindMonthEvents();
  }

  _renderDayPicker(year, month) {
    const months = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const days = ['D','S','T','Q','Q','S','S'];
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    let html = `
      <div class="cal-header">
        <button class="cal-nav" data-dir="-1">&lsaquo;</button>
        <span class="cal-title">${months[month]} ${year}</span>
        <button class="cal-nav" data-dir="1">&rsaquo;</button>
      </div>
      <div class="cal-presets">
        <button class="cal-preset-btn" data-preset="today">Hoje</button>
        <button class="cal-preset-btn" data-preset="month">Este mes</button>
        <button class="cal-preset-btn" data-preset="last30">Ultimos 30 dias</button>
        <button class="cal-preset-btn" data-preset="last90">Ultimos 90 dias</button>
        <button class="cal-preset-btn" data-preset="year">Este ano</button>
      </div>
      <div class="cal-days-header">${days.map(d => `<span>${d}</span>`).join('')}</div>
      <div class="cal-days">
    `;

    // Sempre renderiza 42 celulas (6x7) para tamanho consistente
    const totalCells = 42;
    for (let i = 0; i < firstDay; i++) {
      html += '<span class="cal-day empty"></span>';
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      let cls = 'cal-day';
      if (date > today) cls += ' future';
      if (this.startDate && !this.endDate && this._sameDay(date, this.startDate)) cls += ' start selected';
      if (this.startDate && this.endDate) {
        if (this._sameDay(date, this.startDate)) cls += ' start selected';
        if (this._sameDay(date, this.endDate)) cls += ' end selected';
        if (date > this.startDate && date < this.endDate) cls += ' in-range';
      }
      if (this._sameDay(date, today)) cls += ' today';
      html += `<button class="${cls}" data-day="${d}">${d}</button>`;
    }

    // Celulas vazias para completar 42
    const rendered = firstDay + daysInMonth;
    for (let i = rendered; i < totalCells; i++) {
      html += '<span class="cal-day empty"></span>';
    }

    html += '</div>';
    html += `<div class="cal-footer">
      <button class="cal-clear-btn">Limpar</button>
      <button class="cal-apply-btn">Aplicar</button>
    </div>`;

    this.popup.innerHTML = html;
    this._bindDayEvents(year, month);
  }

  _bindMonthEvents() {
    this.popup.querySelectorAll('.cal-nav').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dir = parseInt(btn.dataset.dir);
        this.viewDate.setFullYear(this.viewDate.getFullYear() + dir);
        this._render();
      });
    });

    this.popup.querySelectorAll('.cal-month:not(.future)').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const m = parseInt(btn.dataset.month);
        const y = parseInt(btn.dataset.year);
        const clicked = new Date(y, m, 1);
        this._handleRangeClick(clicked, true);
      });
    });

    this.popup.querySelectorAll('.cal-preset-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._applyPresetMonth(btn.dataset.preset);
      });
    });

    this.popup.querySelector('.cal-clear-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.startDate = null; this.endDate = null;
      this._render(); this._updateLabel(); this.onSelect(null, null);
    });

    this.popup.querySelector('.cal-apply-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._emitAndClose();
    });
  }

  _bindDayEvents(year, month) {
    this.popup.querySelectorAll('.cal-nav').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dir = parseInt(btn.dataset.dir);
        this.viewDate.setMonth(this.viewDate.getMonth() + dir);
        this._render();
      });
    });

    this.popup.querySelectorAll('.cal-day:not(.empty):not(.future)').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const d = parseInt(btn.dataset.day);
        const clicked = new Date(year, month, d);
        this._handleRangeClick(clicked, false);
      });
    });

    this.popup.querySelectorAll('.cal-preset-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._applyPresetDay(btn.dataset.preset);
      });
    });

    this.popup.querySelector('.cal-clear-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.startDate = null; this.endDate = null;
      this._render(); this._updateLabel(); this.onSelect(null, null);
    });

    this.popup.querySelector('.cal-apply-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._emitAndClose();
    });
  }

  _handleRangeClick(date, isMonth) {
    if (!this.startDate || (this.startDate && this.endDate)) {
      this.startDate = date;
      this.endDate = null;
    } else {
      if (date < this.startDate) {
        this.endDate = this.startDate;
        this.startDate = date;
      } else {
        this.endDate = date;
      }
      if (isMonth) {
        this.endDate = new Date(this.endDate.getFullYear(), this.endDate.getMonth() + 1, 0);
      }
    }
    if (isMonth && this.startDate && !this.endDate) {
      this.endDate = new Date(this.startDate.getFullYear(), this.startDate.getMonth() + 1, 0);
    }
    this._updateLabel();
    this._render();
  }

  _applyPresetMonth(preset) {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    switch (preset) {
      case 'ytd':
        this.startDate = new Date(y, 0, 1);
        this.endDate = new Date(y, m + 1, 0);
        break;
      case 'last12':
        this.startDate = new Date(y, m - 11, 1);
        this.endDate = new Date(y, m + 1, 0);
        break;
      case 'last6':
        this.startDate = new Date(y, m - 5, 1);
        this.endDate = new Date(y, m + 1, 0);
        break;
      case 'last3':
        this.startDate = new Date(y, m - 2, 1);
        this.endDate = new Date(y, m + 1, 0);
        break;
    }
    this._updateLabel(); this._render();
  }

  _applyPresetDay(preset) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    switch (preset) {
      case 'today':
        this.startDate = new Date(now); this.endDate = new Date(now); break;
      case 'month':
        this.startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        this.endDate = new Date(now); break;
      case 'last30':
        this.endDate = new Date(now);
        this.startDate = new Date(now); this.startDate.setDate(this.startDate.getDate() - 30); break;
      case 'last90':
        this.endDate = new Date(now);
        this.startDate = new Date(now); this.startDate.setDate(this.startDate.getDate() - 90); break;
      case 'year':
        this.startDate = new Date(now.getFullYear(), 0, 1);
        this.endDate = new Date(now); break;
    }
    this._updateLabel(); this._render();
  }

  _emitAndClose() {
    this._updateLabel();
    this._close();
    if (this.startDate && this.endDate) {
      this.onSelect(this.startDate, this.endDate);
    }
  }

  _updateLabel() {
    if (!this.startDate || !this.endDate) {
      this.label.textContent = 'Selecione o periodo';
      return;
    }
    if (this.mode === 'month') {
      const fmt = d => `${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      if (this._sameMonth(this.startDate, this.endDate)) {
        this.label.textContent = fmt(this.startDate);
      } else {
        this.label.textContent = `${fmt(this.startDate)} - ${fmt(this.endDate)}`;
      }
    } else {
      const fmt = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      if (this._sameDay(this.startDate, this.endDate)) {
        this.label.textContent = fmt(this.startDate);
      } else {
        this.label.textContent = `${fmt(this.startDate)} - ${fmt(this.endDate)}`;
      }
    }
  }

  _sameDay(a, b) {
    return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  _sameMonth(a, b) {
    return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  }

  setRange(start, end) {
    this.startDate = start; this.endDate = end;
    this._updateLabel();
  }

  getRange() {
    if (!this.startDate || !this.endDate) return null;
    const fmt = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    return { inicio: fmt(this.startDate), fim: fmt(this.endDate) };
  }

  getCompRange() {
    if (!this.startDate || !this.endDate) return null;
    const fmt = d => `${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    return { inicio: fmt(this.startDate), fim: fmt(this.endDate) };
  }
}
