// A small text-input + list combobox styled like the header search dropdown
// (.hs-dropdown / .hs-result in global.css). It replaces native <select>
// elements sitewide -- a native select can't be restyled to look like that,
// so this swaps in a real input plus a rendered results list instead.
//
// The committed value only ever changes via choosing a row, pressing Enter
// on a highlighted row, or setValue() -- so text someone types but never
// selects can never "stick" as the value on its own; on blur the input
// snaps back to whatever is actually committed.

export interface DropdownOption {
  value: string;
  label: string;
  meta?: string;
}

export interface DropdownPickerHandle {
  setValue(value: string, opts?: { silent?: boolean }): void;
  getValue(): string;
}

export interface DropdownPickerConfig {
  /** The positioned (position: relative) wrapper containing input + dropdown. */
  root: HTMLElement;
  input: HTMLInputElement;
  /** The .hs-dropdown element the results render into. */
  dropdown: HTMLElement;
  clearBtn?: HTMLButtonElement | null;
  options: DropdownOption[];
  /** Show the full list on focus, before typing -- good for short, fixed
   *  lists (neighborhoods, cities). Default false requires typing first,
   *  matching the header search exactly -- best for long lists (venues). */
  showAllWhenEmpty?: boolean;
  maxResults?: number;
  noResultsText?: string;
  onChange?: (value: string, option: DropdownOption | null) => void;
}

export function createDropdownPicker(config: DropdownPickerConfig): DropdownPickerHandle {
  const { root, input, dropdown, clearBtn, options } = config;
  const showAllWhenEmpty = config.showAllWhenEmpty ?? false;
  const maxResults = config.maxResults ?? 8;
  const noResultsText = config.noResultsText ?? 'No matches';
  const onChange = config.onChange ?? (() => {});

  let value = '';
  let selectedLabel = '';
  let results: DropdownOption[] = [];
  let activeIndex = -1;

  dropdown.setAttribute('role', 'listbox');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  if (dropdown.id) input.setAttribute('aria-controls', dropdown.id);

  function normalize(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // Swap the active row's highlight in place, without touching the rest of
  // the list. This must never rebuild the DOM: rebuilding the very row the
  // cursor is resting on (as calling paint() from here used to do) replaces
  // it with a new node at the same on-screen spot, which the browser then
  // treats as freshly entered -- firing mouseenter again on the replacement
  // and looping paint() indefinitely. That runaway loop was tearing the
  // list apart underneath a resting mouse, which is why a real click could
  // land on the dropdown's wrapper instead of the row it was aimed at.
  function setActive(index: number) {
    const prevRow = dropdown.children.item(activeIndex) as HTMLElement | null;
    prevRow?.classList.remove('hs-active');
    prevRow?.setAttribute('aria-selected', 'false');
    activeIndex = index;
    const nextRow = dropdown.children.item(activeIndex) as HTMLElement | null;
    nextRow?.classList.add('hs-active');
    nextRow?.setAttribute('aria-selected', 'true');
  }

  function paint() {
    dropdown.innerHTML = '';
    if (!results.length) {
      const empty = document.createElement('div');
      empty.className = 'hs-no-results';
      empty.textContent = noResultsText;
      dropdown.appendChild(empty);
      return;
    }
    results.forEach((opt, i) => {
      const row = document.createElement('div');
      row.className = i === activeIndex ? 'hs-result hs-active' : 'hs-result';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(i === activeIndex));
      const strong = document.createElement('strong');
      strong.textContent = opt.label;
      row.appendChild(strong);
      if (opt.meta) {
        const span = document.createElement('span');
        span.textContent = opt.meta;
        row.appendChild(span);
      }
      row.addEventListener('mousedown', (e) => {
        e.preventDefault(); // beat the input's blur so it never snaps back first
        choose(opt);
      });
      row.addEventListener('mouseenter', () => setActive(i));
      dropdown.appendChild(row);
    });
  }

  function search(query: string) {
    const n = normalize(query);
    if (!n) {
      if (!showAllWhenEmpty) { close(); return; }
      results = options.slice(0, maxResults);
    } else {
      results = options.filter((o) =>
        normalize(o.label).includes(n) || (o.meta ? normalize(o.meta).includes(n) : false)
      ).slice(0, maxResults);
    }
    activeIndex = -1;
    paint();
    dropdown.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function close() {
    dropdown.hidden = true;
    dropdown.innerHTML = '';
    results = [];
    activeIndex = -1;
    input.setAttribute('aria-expanded', 'false');
  }

  function choose(opt: DropdownOption) {
    value = opt.value;
    selectedLabel = opt.label;
    input.value = opt.label;
    if (clearBtn) clearBtn.hidden = !value;
    close();
    onChange(value, opt);
  }

  input.addEventListener('focus', () => search(input.value.trim()));
  input.addEventListener('input', () => search(input.value.trim()));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(); input.blur(); return; }
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((activeIndex + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((activeIndex - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      // Enter commits the highlighted row, or -- when nothing is highlighted
      // -- whatever the typed text best matches. Without this, Enter fell
      // through to the surrounding form and submitted with the field empty,
      // so a typed "Bar" was saved as "prefer not to say".
      const pick = activeIndex >= 0 ? results[activeIndex] : bestMatch();
      if (pick) { e.preventDefault(); choose(pick); }
    }
  });
  // The option the typed text most plausibly means: an exact label match,
  // else the only remaining result, else nothing.
  function bestMatch(): DropdownOption | null {
    const n = normalize(input.value.trim());
    if (!n) return null;
    const exact = results.find((o) => normalize(o.label) === n);
    if (exact) return exact;
    return results.length === 1 ? results[0] : null;
  }
  input.addEventListener('blur', () => {
    // A row's mousedown (preventDefault'd above) wins the race if that's
    // what's happening. Otherwise, if what they typed clearly names an
    // option (tabbing away after typing "Brewery"), commit it; if not, snap
    // the visible text back to whatever is actually committed.
    const typed = input.value.trim();
    const pick = typed && typed !== selectedLabel ? bestMatch() : null;
    setTimeout(() => {
      if (pick && input.value.trim() === typed) { choose(pick); return; }
      input.value = selectedLabel; close();
    }, 0);
  });
  document.addEventListener('click', (e) => {
    if (!root.contains(e.target as Node)) close();
  });
  clearBtn?.addEventListener('click', () => {
    value = '';
    selectedLabel = '';
    input.value = '';
    clearBtn.hidden = true;
    close();
    input.focus();
    onChange('', null);
  });

  return {
    setValue(v, opts) {
      const opt = options.find((o) => o.value === v);
      value = v;
      selectedLabel = opt?.label || '';
      input.value = selectedLabel;
      if (clearBtn) clearBtn.hidden = !v;
      if (!opts?.silent) onChange(value, opt || null);
    },
    getValue() {
      return value;
    },
  };
}
