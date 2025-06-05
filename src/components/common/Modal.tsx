import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react'; // Using lucide-react for icons

interface ModalProps {
  title: string;
  message: string | React.ReactNode;
  onOk?: () => void; // onOk will also close the modal by default via ModalContext
  onClose: () => void; // Provided by ModalContext to just close
}

const Modal: React.FC<ModalProps> = ({ title, message, onOk, onClose }) => {
  const modalDialogRef = useRef<HTMLDivElement>(null);

  // For entry/exit animations (similar to the observer logic in original HTML)
  useEffect(() => {
    const dialog = modalDialogRef.current;
    if (dialog) {
      // Ensure it's visible before starting animation
      requestAnimationFrame(() => {
        dialog.classList.remove('scale-95', 'opacity-0');
        dialog.classList.add('scale-100', 'opacity-100');
      });
    }
    // No explicit cleanup for exit animation here, ModalContext handles removal from DOM
  }, []);


  const handleOk = () => {
    if (onOk) {
      onOk(); // The onOk in ModalContext already includes closing
    } else {
      onClose(); // If no specific onOk, just close
    }
  };


  return (
    <div
      id="messageModal"
      className="fixed inset-0 bg-slate-900 bg-opacity-75 overflow-y-auto h-full w-full flex items-center justify-center p-4 z-[100] transition-opacity duration-300"
      onClick={onClose} // Click outside to close
    >
      <div
        ref={modalDialogRef}
        id="modalDialog"
        className="relative p-6 sm:p-8 border-0 w-full max-w-lg shadow-2xl rounded-xl bg-white transform transition-all duration-300 scale-95 opacity-0"
        onClick={(e) => e.stopPropagation()} // Prevent click inside from closing
      >
        <button
          id="modalCloseButton"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Close modal"
        >
          <X size={28} />
        </button>
        <div className="mt-3 text-center sm:text-left">
          <h3 className="text-xl leading-6 font-bold text-slate-900 mb-3" id="modalTitle">
            {title}
          </h3>
          <div className="mt-2">
            {typeof message === 'string' ? (
              <p className="text-sm text-slate-600 leading-relaxed" id="modalMessage" dangerouslySetInnerHTML={{ __html: message.replace(/\n/g, '<br />') }} />
            ) : (
              <div className="text-sm text-slate-600 leading-relaxed" id="modalMessage">{message}</div>
            )}
          </div>
          <div className="mt-6 sm:mt-8 text-center sm:text-right">
            <button
              id="modalOkButton"
              onClick={handleOk}
              className="btn btn-primary w-full sm:w-auto"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Modal;
