export default function IconButton({ label, shortcut = '', children, className = '', active = false, ...props }) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? 'is-active' : ''} ${className}`}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      {...props}
    >
      {children}
    </button>
  );
}
