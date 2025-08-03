document.addEventListener('DOMContentLoaded', () => {
  const calendar      = document.getElementById('calendar');
  const labels        = document.getElementById('labels');
  const scrollWrapper = document.getElementById('scroll-wrapper');
  const palette       = document.getElementById('palette');
  const createBtn     = document.getElementById('create-block-btn');

  let selectedBlock   = null;
  let copiedBlockData = null;
  let latestMouseY    = 0;
  const initialTypes  = ['work','eat','exercise','free time','going out','misc'];

  function getColorForType(type) {
    if (type==='eat'||type==='exercise')            return 'lightyellow';
    if (['free time','going out','misc'].includes(type)) return '#ffe0e0';
    if (type==='work')                                  return '#e0ffe0';
    return '#ddd';
  }

  // Build grid and current‐time line
  const currentTimeLine = document.createElement('div');
  currentTimeLine.id = 'current-time-line';
  calendar.appendChild(currentTimeLine);
  function updateCurrentTimeLine() {
    const now     = new Date(),
          minutes = now.getHours()*60 + now.getMinutes(),
          y       = Math.round(minutes/15)*15;
    currentTimeLine.style.top = `${y}px`;
  }
  updateCurrentTimeLine();
  setInterval(updateCurrentTimeLine, 60000);

  for (let i = 0; i < 96; i++) {
    const slot = document.createElement('div');
    slot.className = 'time-slot' + (i%4===0?' hour':'');
    calendar.appendChild(slot);
    if (i%4===0) {
      const line = document.createElement('div');
      line.className = 'label-line';
      line.style.top = `${i*15}px`;
      const h    = Math.floor(i/4),
            ampm = h >= 12 ? 'pm' : 'am',
            dh   = h % 12 || 12;
      line.innerText = `${dh}:00 ${ampm}`;
      labels.appendChild(line);
    }
  }

  // Placeholder for drag preview
  const placeholder = document.createElement('div');
  placeholder.className = 'placeholder';
  placeholder.style.display = 'none';
  calendar.appendChild(placeholder);

  // Initialize palette items
  function initPaletteItem(tpl) {
    tpl.draggable = true;
    tpl.dataset.type = tpl.innerText.trim().toLowerCase();
    tpl.style.backgroundColor = getColorForType(tpl.dataset.type);

    tpl.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', tpl.dataset.type);
      // hide native ghost
      const img = new Image();
      img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
      e.dataTransfer.setDragImage(img, 0, 0);
      placeholder.style.display = 'block';
      tpl.classList.add('dragging');
    });
    tpl.addEventListener('dragend', () => {
      placeholder.style.display = 'none';
      tpl.classList.remove('dragging');
    });

    // *** NEW: double‐click now selects the block ***
    tpl.addEventListener('dblclick', () => {
      deselectBlock();
      tpl.classList.add('selected');
      selectedBlock = tpl;

      // also enter edit mode if you like
      tpl.classList.add('editing');
      tpl.setAttribute('contenteditable','true');
      tpl.focus();
    });
    tpl.addEventListener('blur', () => {
      tpl.classList.remove('editing');
      tpl.removeAttribute('contenteditable');
      tpl.dataset.type = tpl.innerText.trim().toLowerCase() || 'custom';
      tpl.style.backgroundColor = getColorForType(tpl.dataset.type);
      saveCustomBlocks();
    });
  }

  // Load custom blocks
  chrome.storage.local.get('customBlocks', data => {
    (data.customBlocks||[]).forEach(txt => {
      const tpl = document.createElement('div');
      tpl.className = 'draggable-template';
      tpl.innerText = txt;
      palette.insertBefore(tpl, createBtn);
    });
    document.querySelectorAll('.draggable-template').forEach(initPaletteItem);
  });

  // Create new custom block
  createBtn.addEventListener('click', () => {
    const tpl = document.createElement('div');
    tpl.className = 'draggable-template';
    tpl.innerText = '';
    initPaletteItem(tpl);
    palette.insertBefore(tpl, createBtn);
    saveCustomBlocks();
  });

  function saveCustomBlocks() {
    const customs = Array.from(palette.querySelectorAll('.draggable-template'))
                         .map(t=>t.dataset.type)
                         .filter(t=>!initialTypes.includes(t));
    chrome.storage.local.set({ customBlocks: customs });
  }

  // Scroll persistence
  scrollWrapper.addEventListener('scroll', () => {
    chrome.storage.local.set({ scrollTop: scrollWrapper.scrollTop });
  });

  // Drag preview
  calendar.addEventListener('dragover', e => {
    e.preventDefault();
    const wr     = scrollWrapper.getBoundingClientRect();
    const rawY   = (e.clientY - wr.top + scrollWrapper.scrollTop) - 30;
    const snapped= Math.round(rawY/15)*15;
    placeholder.style.top = `${Math.max(0, Math.min(snapped, calendar.clientHeight-60))}px`;
    placeholder.style.display = 'block';
  });
  calendar.addEventListener('dragleave', () => {
    placeholder.style.display = 'none';
  });

  // Drop handler
  calendar.addEventListener('drop', e => {
    e.preventDefault();
    placeholder.style.display = 'none';
    const type = e.dataTransfer.getData('text/plain');
    const wr   = scrollWrapper.getBoundingClientRect();
    const rawY = (e.clientY - wr.top + scrollWrapper.scrollTop) - 30;
    const y    = Math.max(0, Math.min(calendar.clientHeight-60, Math.round(rawY/15)*15));

    const blk = document.createElement('div');
    blk.className = 'event';
    blk.innerText = type;
    blk.style.top = `${y}px`;
    blk.style.height = '60px';
    blk.style.backgroundColor = getColorForType(type);

    addBlockListeners(blk);
    makeDraggableAndResizable(blk);
    calendar.appendChild(blk);
    saveSchedule();

    // Remove one‐time custom
    const tpl = palette.querySelector('.draggable-template.dragging');
    if (tpl && !initialTypes.includes(tpl.dataset.type)) {
      tpl.remove();
      saveCustomBlocks();
    }
  });

  // Deselect outside click, delete/copy/paste
  document.addEventListener('click', e => {
    if (!e.target.classList.contains('event')) deselectBlock();
  });
  document.addEventListener('keydown', e => {
    const isMac = /Mac/.test(navigator.platform),
          ctrl  = isMac ? e.metaKey : e.ctrlKey;

    if ((e.key==='Delete'||e.key==='Backspace') && selectedBlock && !selectedBlock.classList.contains('editing')) {
      selectedBlock.remove();
      selectedBlock = null;
      saveSchedule();
    }
    if (ctrl && e.key==='c' && selectedBlock) {
      copiedBlockData = {
        text:   selectedBlock.innerText,
        height: selectedBlock.style.height,
        color:  selectedBlock.style.backgroundColor
      };
    }
    if (ctrl && e.key==='v' && copiedBlockData) {
      const rawY = latestMouseY - 30;
      const y    = Math.max(0, Math.min(calendar.clientHeight-parseInt(copiedBlockData.height||60),
                           Math.round(rawY/15)*15));
      const b = document.createElement('div');
      b.className = 'event';
      b.innerText = copiedBlockData.text;
      b.style.top = `${y}px`;
      b.style.height = copiedBlockData.height;
      b.style.backgroundColor = copiedBlockData.color;
      addBlockListeners(b);
      makeDraggableAndResizable(b);
      calendar.appendChild(b);
      saveSchedule();
    }
  });

  // Track mouse for paste
  calendar.addEventListener('mousemove', e => {
    const wr         = scrollWrapper.getBoundingClientRect();
    latestMouseY     = e.clientY - wr.top + scrollWrapper.scrollTop;
  });

  function deselectBlock() {
    if (selectedBlock) selectedBlock.classList.remove('selected');
    selectedBlock = null;
  }

  function addBlockListeners(b) {
  // Single-click now selects
  b.addEventListener('click', e => {
    deselectBlock();
    b.classList.add('selected');
    selectedBlock = b;
    e.stopPropagation();
  });

  // Double-click enters edit mode
  b.addEventListener('dblclick', () => {
    b.classList.add('editing');
    b.setAttribute('contenteditable','true');
    b.focus();
  });

  // Blur exits edit mode
  b.addEventListener('blur', () => {
    b.classList.remove('editing');
    b.removeAttribute('contenteditable');
    saveSchedule();
  });
}


  function makeDraggableAndResizable(el) {
    let isResizing=false, dir=null, offset=0;
    el.addEventListener('mousedown', e => {
      if (e.button!==0 || el.classList.contains('editing')) return;
      deselectBlock();
      offset = e.offsetY;
      const wr     = scrollWrapper.getBoundingClientRect(),
            startY = e.clientY,
            startTop = el.offsetTop,
            startH   = el.offsetHeight;

      if (e.offsetY < 10)                  { isResizing=true; dir='top'; }
      else if (e.offsetY > startH - 10)    { isResizing=true; dir='bottom'; }

      function onMove(e) {
        const scrollY = scrollWrapper.scrollTop;
        if (isResizing) {
          if (dir==='bottom') {
            let h = Math.round((startH+(e.clientY-startY))/15)*15;
            h = Math.max(15, Math.min(h, calendar.clientHeight-startTop));
            el.style.height=`${h}px`;
          } else {
            let delta = e.clientY - startY,
                nt    = Math.round((startTop+delta)/15)*15,
                h     = Math.round((startH-delta)/15)*15;
            if (nt>=0 && nt+h<=calendar.clientHeight) {
              el.style.top=`${nt}px`;
              el.style.height=`${h}px`;
            }
          }
        } else {
          let y = (e.clientY - wr.top + scrollY) - offset;
          y = Math.max(0, Math.min(y, calendar.clientHeight - el.offsetHeight));
          el.style.top = `${Math.round(y/15)*15}px`;
        }
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        isResizing=false; dir=null;
        saveSchedule();
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function saveSchedule() {
    const arr = Array.from(calendar.querySelectorAll('.event')).map(evt => ({
      top: evt.style.top,
      height: evt.style.height,
      text: evt.innerText,
      color: evt.style.backgroundColor
    }));
    chrome.storage.local.set({ schedule: arr, scrollTop: scrollWrapper.scrollTop });
  }

  chrome.storage.local.get(['schedule','scrollTop'], data => {
    (data.schedule||[]).forEach(evt => {
      const b = document.createElement('div');
      b.className = 'event';
      b.innerText = evt.text;
      b.style.top = evt.top;
      b.style.height = evt.height;
      b.style.backgroundColor = evt.color;
      addBlockListeners(b);
      makeDraggableAndResizable(b);
      calendar.appendChild(b);
    });
    if (typeof data.scrollTop === 'number') {
      scrollWrapper.scrollTop = data.scrollTop;
    }
  });
});
