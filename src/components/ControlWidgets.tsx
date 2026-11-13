import { useId } from 'react';

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  formatValue?: (v: number) => string;
  onChange: (value: number) => void;
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  formatValue,
  onChange,
}: SliderRowProps) {
  const id = useId();
  const display = formatValue ? formatValue(value) : String(value);

  return (
    <div className="control-row">
      <div className="control-header">
        <label className="control-label" htmlFor={id}>
          {label}
        </label>
        <span className="control-value">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectRowProps<T extends string> {
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
}

export function SelectRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: SelectRowProps<T>) {
  const id = useId();
  return (
    <div className="control-row">
      <label className="control-label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="select-input"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function ToggleRow({ label, checked, onChange }: ToggleRowProps) {
  const id = useId();
  return (
    <label className="toggle-row" htmlFor={id}>
      <span className="control-label">{label}</span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

interface TextInputRowProps {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}

export function TextInputRow({ label, value, placeholder, onChange }: TextInputRowProps) {
  const id = useId();
  return (
    <div className="control-row">
      <label className="control-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        className="text-input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
