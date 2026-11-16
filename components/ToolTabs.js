'use client';

export default function ToolTabs({ tabs, value, onChange }) {
  return (
    <div className="tool-tabs" role="tablist">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          className={`tool-tab${value === id ? ' active' : ''}`}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
