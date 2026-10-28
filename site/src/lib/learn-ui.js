// Small presentation helpers shared by Learn pages (build time).
// Module icon -> an existing colour group from global.css ([data-g] sets --gc).
const TONE = { brain: 'review', prompt: 'quality', vector: 'git', rag: 'build', agent: 'contracts', eval: 'quality', server: 'git', shield: 'security', design: 'review', team: 'contracts' };
export const iconTone = (icon) => TONE[icon] || 'other';
