import React, { useState, useEffect } from 'react';

interface SliderInputProps {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  initialValue: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
  units?: string; // e.g., "km", "%"
}

const SliderInput: React.FC<SliderInputProps> = ({
  id,
  label,
  min,
  max,
  step,
  initialValue,
  onChange,
  disabled = false,
  className = '',
  units = ''
}) => {
  const [value, setValue] = useState<number>(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(event.target.value);
    setValue(newValue);
    onChange(newValue);
  };

  return (
    <div className={`mb-4 ${className}`}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1">
        {label}: <span className="slider-value">{value}{units}</span>
      </label>
      <input
        type="range"
        id={id}
        name={id}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        className="w-full h-2.5 bg-slate-300 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  );
};

export default SliderInput;
