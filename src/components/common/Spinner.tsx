import React from 'react';

interface SpinnerProps {
  size?: 'small' | 'medium' | 'large'; // For tailwind width/height classes
  className?: string; // Allow additional classes
  message?: string;
}

const Spinner: React.FC<SpinnerProps> = ({ size = 'medium', className = '', message }) => {
  let sizeClasses = 'w-10 h-10 border-4'; // Corresponds to .spinner
  if (size === 'small') sizeClasses = 'w-6 h-6 border-2';
  if (size === 'large') sizeClasses = 'w-16 h-16 border-4';

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div
        className={`spinner ${sizeClasses}`} // Uses .spinner class from index.css
        role="status"
        aria-live="polite"
        aria-label={message || "Loading..."}
      >
        <span className="sr-only">{message || "Loading..."}</span>
      </div>
      {message && <p className="mt-2 text-sm text-slate-600">{message}</p>}
    </div>
  );
};

export default Spinner;
