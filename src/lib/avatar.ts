// Shared avatar rendering: an uploaded photo if the user has one, otherwise
// a colored circle with their initials. Used on the header widget
// (Base.astro) and the profile page -- kept here once so both stay in sync.

export function initialsFor(name?: string | null, email?: string | null): string {
  const source = (name && name.trim()) || (email ? email.split('@')[0] : '') || '';
  const parts = source.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function paintAvatar(
  el: HTMLElement | null,
  avatarUrl?: string | null,
  name?: string | null,
  email?: string | null
) {
  if (!el) return;
  if (avatarUrl) {
    el.innerHTML = '';
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = '';
    el.appendChild(img);
  } else {
    el.textContent = initialsFor(name, email);
  }
}
