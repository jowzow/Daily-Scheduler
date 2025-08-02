document.addEventListener('DOMContentLoaded', () => {
  const calendar = document.getElementById('calendar');
  const labels = document.getElementById('labels');
  const scrollWrapper = document.getElementById('scroll-wrapper');
  const palette = document.getElementById('palette');
  const createBtn = document.getElementById('create-block-btn');
  let selectedBlock = null;
  let copiedBlockData = null;
  let latestMouseYInCalendar = null;

  const initialTypes = ['work', 'eat', 'exercise', 'free time', 'going out', 'misc'];

  const currentTimeLine = document.createElement('div');
  currentTimeLine.id = 'current-time-line';
  calendar.appendChild(currentTimeLine);
  function updateCurrentTimeLine() {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    currentTimeLine.style.top = `${Math.round(minutes / 15) * 15}px`;
  }
  updateCurrentTimeLine();
  setInterval(updateCurrentTimeLine, 60000);

  for (let i = 0; i < 96; i++) {
    const slot = document.createElement('div');
    slot.className = 'time-slot' + (i % 4 === 0 ? ' hour' : '');
    calendar.appendChild(slot);
    if (i % 4 === 0) {
      const line = document.createElement('div');
      line.className = 'label-line';
      line.style.top = `${i * 15}px`;
      const h = Math.floor(i / 4), ampm = h >= 12 ? 'pm' : 'am', dh = h % 12 || 12;
      line.innerText = `${dh}:00 ${ampm}`;
      labels.appendChild(line);
    }
  }

  function initPaletteItem(tpl) {
    tpl.draggable = true;
    tpl.dataset.type = tpl.innerText.trim().toLowerCase();
    tpl.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', tpl.dataset.type);
      e.dataTransfer.setData('custom-block-id', tpl.dataset.type + Math.random());
      e.dataTransfer.effectAllowed = "move";
      tpl.classList.add('dragging');
    });
    tpl.addEventListener('dragend', () => {
      tpl.classList.remove('dragging');
    });
    tpl.addEventListener('dblclick', () => {
      tpl.setAttribute('contenteditable', 'true');
      tpl.focus();
    });
    tpl.addEventListener('blur', () => {
      tpl.removeAttribute('contenteditable');
      tpl.dataset.type = tpl.innerText.trim().toLowerCase() || 'custom';
      saveCustomBlocks();
    });
  }

  chrome.storage.local.get('customBlocks', data => {
    const customs = data.customBlocks || [];
    for (const txt of customs) {
      const tpl = document.createElement('div');
      tpl.className = 'draggable-template';
      tpl.innerText = txt;
      tpl.dataset.type = txt;
      initPaletteItem(tpl);
      palette.insertBefore(tpl, createBtn);
    }
    document.querySelectorAll('.draggable-template')
      .forEach(initPaletteItem);
  });

  createBtn.addEventListener('click', () => {
    const tpl = document.createElement('div');
    tpl.className = 'draggable-template';
    tpl.innerText = ''; // blank by default
    tpl.dataset.type = 'custom';
    initPaletteItem(tpl);
    palette.insertBefore(tpl, createBtn);
    saveCustomBlocks();
  });

  function saveCustomBlocks() {
    const customs = Array.from(palette.querySelectorAll('.draggable-template'))
      .map(t => t.dataset.type)
      .filter(t => !initialTypes.includes(t));
    chrome.storage.local.set({ customBlocks: customs });
  }

  calendar.addEventListener('dragover', e => e.preventDefault());
  calendar.addEventListener('drop', e => {
    e.preventDefault();
    const type = e.dataTransfer.getData('text/plain');
    const block = document.createElement('div');
    block.className = 'event';
    block.innerText = type;

    if (type === 'eat' || type === 'exercise') block.style.backgroundColor = 'lightyellow';
    else if (['free time', 'going out', 'misc'].includes(type)) block.style.backgroundColor = '#ffe0e0';
    else if (type === 'work') block.style.backgroundColor = '#e0ffe0';
    else block.style.backgroundColor = '#ddd';

    const rect = calendar.getBoundingClientRect();
    let y = Math.round((e.clientY - rect.top) / 15) * 15;
    y = Math.max(0, Math.min(y, calendar.clientHeight - 60));
    block.style.top = `${y}px`;
    block.style.height = '60px';

    addBlockListeners(block);
    makeDraggableAndResizable(block);
    calendar.appendChild(block);
    saveSchedule();

    const allTemplates = Array.from(palette.querySelectorAll('.draggable-template'));
    const match = allTemplates.find(t =>
      !initialTypes.includes(t.dataset.type) &&
      t.classList.contains('dragging')
    );
    if (match) {
      match.remove();
      saveCustomBlocks();
    }
  });

  calendar.addEventListener('mousemove', e => {
    const rect = calendar.getBoundingClientRect();
    latestMouseYInCalendar = e.clientY - rect.top;
  });

  document.addEventListener('click', e => {
    if (!e.target.classList.contains('event')) deselectBlock();
  });

  document.addEventListener('keydown', e => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const ctrl = isMac ? e.metaKey : e.ctrlKey;

    if ((e.key === 'Delete' || e.key === 'Backspace') &&
        selectedBlock && !selectedBlock.classList.contains('editing')) {
      selectedBlock.remove();
      selectedBlock = null;
      saveSchedule();
    }

    if (ctrl && e.key === 'c' && selectedBlock) {
      copiedBlockData = {
        text: selectedBlock.innerText,
        height: selectedBlock.style.height,
        color: selectedBlock.style.backgroundColor
      };
    }

    if (ctrl && e.key === 'v' && copiedBlockData) {
      let y = latestMouseYInCalendar;
      if (y == null) return;
      y = Math.round(y / 15) * 15;
      y = Math.max(0, Math.min(y, calendar.clientHeight - 15));

      const block = document.createElement('div');
      block.className = 'event';
      block.innerText = copiedBlockData.text;
      block.style.top = `${y}px`;
      block.style.height = copiedBlockData.height || '60px';
      block.style.backgroundColor = copiedBlockData.color || '#ddd';

      addBlockListeners(block);
      makeDraggableAndResizable(block);
      calendar.appendChild(block);
      saveSchedule();
    }
  });

  function deselectBlock() {
    if (selectedBlock) selectedBlock.classList.remove('selected');
    selectedBlock = null;
  }

  function addBlockListeners(b) {
    b.addEventListener('click', e => {
      deselectBlock();
      b.classList.add('selected');
      selectedBlock = b;
      e.stopPropagation();
    });
    b.addEventListener('dblclick', () => {
      b.classList.add('editing');
      b.setAttribute('contenteditable', 'true');
      b.focus();
    });
    b.addEventListener('blur', () => {
      b.classList.remove('editing');
      b.setAttribute('contenteditable', 'false');
      saveSchedule();
    });
  }

  function makeDraggableAndResizable(el) {
    let isResizing = false, dir = null, offsetY = 0;
    el.addEventListener('mousedown', e => {
      if (e.button !== 0 || el.classList.contains('editing')) return;
      deselectBlock();
      const rect = calendar.getBoundingClientRect();
      const startY = e.clientY, startTop = el.offsetTop, startH = el.offsetHeight;
      offsetY = e.offsetY;

      if (e.offsetY < 10) dir = 'top', isResizing = true;
      else if (e.offsetY > startH - 10) dir = 'bottom', isResizing = true;

      function onMouseMove(e) {
        if (isResizing) {
          if (dir === 'bottom') {
            let h = Math.round((startH + (e.clientY - startY)) / 15) * 15;
            h = Math.max(15, Math.min(h, calendar.clientHeight - startTop));
            el.style.height = `${h}px`;
          } else {
            let delta = e.clientY - startY;
            let newTop = Math.round((startTop + delta) / 15) * 15;
            let h = Math.round((startH - delta) / 15) * 15;
            if (newTop >= 0 && newTop + h <= calendar.clientHeight) {
              el.style.top = `${newTop}px`;
              el.style.height = `${h}px`;
            }
          }
        } else {
          let y = Math.round((e.clientY - rect.top - offsetY) / 15) * 15;
          y = Math.max(0, Math.min(y, calendar.clientHeight - el.offsetHeight));
          el.style.top = `${y}px`;
        }
      }

      function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        isResizing = false;
        dir = null;
        saveSchedule();
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  function saveSchedule() {
    const evs = Array.from(document.querySelectorAll('.event')).map(evt => ({
      top: evt.style.top,
      height: evt.style.height,
      text: evt.innerText,
      color: evt.style.backgroundColor || ''
    }));
    chrome.storage.local.set({
      schedule: evs,
      scrollTop: scrollWrapper.scrollTop
    });
  }

  scrollWrapper.addEventListener('scroll', () => {
    chrome.storage.local.set({ scrollTop: scrollWrapper.scrollTop });
  });

  chrome.storage.local.get(['schedule', 'scrollTop'], data => {
    (data.schedule || []).forEach(evt => {
      const b = document.createElement('div');
      b.className = 'event';
      b.innerText = evt.text;
      b.style.top = evt.top;
      b.style.height = evt.height;
      b.style.backgroundColor = evt.color || '#ddd';
      b.setAttribute('contenteditable', false);
      addBlockListeners(b);
      makeDraggableAndResizable(b);
      calendar.appendChild(b);
    });
    if (typeof data.scrollTop === 'number') {
      scrollWrapper.scrollTop = data.scrollTop;
    }
  });
});
