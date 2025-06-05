import React, { createContext, useState, useContext, ReactNode } from 'react';

interface ModalConfig {
  isOpen: boolean;
  title: string;
  message: string | ReactNode;
  onOk?: () => void;
  onClose?: () => void; // Optional: if you want a specific close action separate from OK
}

interface ModalContextType {
  modalConfig: ModalConfig;
  showModal: (title: string, message: string | ReactNode, onOk?: () => void) => void;
  hideModal: () => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [modalConfig, setModalConfig] = useState<ModalConfig>({
    isOpen: false,
    title: '',
    message: '',
  });

  const showModal = (title: string, message: string | ReactNode, onOk?: () => void) => {
    setModalConfig({
      isOpen: true,
      title,
      message,
      onOk: () => {
        if (onOk) onOk();
        hideModal();
      },
      onClose: hideModal, // Default close action
    });
  };

  const hideModal = () => {
    setModalConfig({
      isOpen: false,
      title: '',
      message: '',
    });
  };

  return (
    <ModalContext.Provider value={{ modalConfig, showModal, hideModal }}>
      {children}
    </ModalContext.Provider>
  );
};

export const useModal = (): ModalContextType => {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};
