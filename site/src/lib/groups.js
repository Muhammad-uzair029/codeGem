// Visual identity per skill group: a slug for CSS (colour tokens live in
// global.css under [data-g="<slug>"]) and a small line icon (24x24 paths).
// Unknown groups fall back to "other".

const GROUPS = {
  Build: {
    slug: 'build',
    icon: '<path d="M4 20h16"/><path d="M6 20V10l6-5 6 5v10"/><path d="M10 20v-5h4v5"/>',
  },
  'Quality gates': {
    slug: 'quality',
    icon: '<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  },
  'Contracts and data': {
    slug: 'contracts',
    icon: '<path d="M7 7h11l-3-3"/><path d="M17 17H6l3 3"/><circle cx="5" cy="7" r="1.6"/><circle cx="19" cy="17" r="1.6"/>',
  },
  Security: {
    slug: 'security',
    icon: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><path d="M12 14.5v2"/>',
  },
  'Review and design': {
    slug: 'review',
    icon: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.2-4.2"/><path d="M8.5 11h5M11 8.5v5"/>',
  },
  'Git and docs': {
    slug: 'git',
    icon: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 8v8"/><path d="M18 10c0 4-6 3-11 6.5"/>',
  },
};

const OTHER = {
  slug: 'other',
  icon: '<path d="M12 3 4 9l8 12 8-12z"/><path d="M4 9h16"/>',
};

/** @param {string} name */
export function groupMeta(name) {
  return GROUPS[name] || OTHER;
}

/** @param {string} name */
export function groupSlug(name) {
  return groupMeta(name).slug;
}
