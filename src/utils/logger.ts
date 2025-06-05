import { twColors } from '../data/ccrData'; // Assuming twColors is exported for rich log colors

export type LogType = 'SYSTEM' | 'ERROR' | 'AGENT' | 'ORDER' | 'DELIVERY' | 'ASSIGN' | 'AI' | 'NAV' | 'ALGO' | 'TRAFFIC' | 'INFO' | 'WARN';

export interface LogEntry {
  id: string;
  timestamp: string;
  simTime?: string;
  type: LogType;
  message: string;
  rawMessage: string; // For potential non-HTML use
}

const getLogTypeColorClass = (type: LogType): string => {
  switch (type) {
    case 'ERROR': return 'text-red-400 font-semibold';
    case 'AGENT': return `text-[${twColors.green[400]}]`; // Example using actual hex
    case 'ORDER': return `text-[${twColors.sky[400]}]`;
    case 'DELIVERY': return `text-[${twColors.purple[400]}]`;
    case 'ASSIGN': return `text-[${twColors.amber[400]}]`;
    case 'AI': return `text-[${twColors.teal[400]}] font-semibold`;
    case 'NAV': return 'text-pink-400'; // Direct Tailwind class
    case 'ALGO': return 'text-indigo-400'; // Direct Tailwind class
    case 'TRAFFIC': return 'text-orange-400'; // Direct Tailwind class
    case 'INFO': return 'text-blue-400'; // Direct Tailwind class
    case 'WARN': return 'text-yellow-400 font-semibold'; // Direct Tailwind class
    case 'SYSTEM':
    default:
      return 'text-slate-300'; // Default Tailwind class
  }
};


// This is a utility function that components can import.
// For actual display, you'd have a LogPanel component that uses this.
export const createLogEntry = (
  message: string,
  type: LogType = 'SYSTEM',
  simTime: string | null = null
): LogEntry => {
  const timeStampStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const simTimeStr = simTime ? `[Sim: ${simTime}] ` : '';
  const sanitizedMessage = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // For direct HTML rendering in a LogPanel component
  const formattedMessageHTML = `<span class="text-slate-500">${timeStampStr}</span> ${simTimeStr}<span class="${getLogTypeColorClass(type)} font-medium">[${type.toUpperCase()}]</span> ${sanitizedMessage}`;

  return {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: timeStampStr,
    simTime: simTime || undefined,
    type,
    message: formattedMessageHTML, // This would be used with dangerouslySetInnerHTML
    rawMessage: message, // Original message for other uses
  };
};

// Example of how a LogPanel component might manage and display logs:
/*
import React, { useState, useEffect, useRef } from 'react';
import { LogEntry, createLogEntry, LogType } from './logger';

interface LogPanelProps {
  logEntries: LogEntry[];
  heightClass?: string; // e.g., 'h-40'
}

const LogPanel: React.FC<LogPanelProps> = ({ logEntries, heightClass = 'h-60' }) => {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logEntries]);

  return (
    <div className={`log-panel ${heightClass} styled-scrollbar`}>
      {logEntries.map(entry => (
        <p key={entry.id} dangerouslySetInnerHTML={{ __html: entry.message }} />
      ))}
      <div ref={logEndRef} />
    </div>
  );
};
export default LogPanel;

// In your section component:
// const [logs, setLogs] = useState<LogEntry[]>([]);
// const addLog = (message: string, type: LogType, simTime?: string) => {
//   setLogs(prevLogs => [...prevLogs, createLogEntry(message, type, simTime)]);
// };
// Usage: addLog("System ready.", "SYSTEM");
// <LogPanel logEntries={logs} />
*/

export const initialSystemLog = (logAreaName: string, context: string = "CCR"): LogEntry => {
    return createLogEntry(
        `System ready for ${context}. Configure parameters and ${logAreaName}.`,
        'SYSTEM'
    );
};
