// General helper functions

/**
 * Formats simulation time from total minutes to HH:MM format.
 * @param totalMinutes - The total number of minutes in the simulation.
 * @returns A string representing the time in HH:MM format.
 */
export const formatSimTime = (totalMinutes: number): string => {
  if (isNaN(totalMinutes) || totalMinutes < 0) {
    return '00:00';
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

/**
 * Generates a simple unique ID.
 * Useful for keys in React lists or temporary identifiers.
 * @param prefix - Optional prefix for the ID.
 * @returns A unique string ID.
 */
export const generateUniqueId = (prefix: string = 'id_'): string => {
  return `${prefix}${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Delays execution for a specified number of milliseconds.
 * @param ms - The number of milliseconds to wait.
 * @returns A promise that resolves after the specified delay.
 */
export const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};


/**
 * Clamps a number between a minimum and maximum value.
 * @param num The number to clamp.
 * @param min The minimum value.
 * @param max The maximum value.
 * @returns The clamped number.
 */
export const clamp = (num: number, min: number, max: number): number => {
  return Math.min(Math.max(num, min), max);
};


/**
 * Converts an array of items into a CSV string.
 * @param data Array of objects to convert.
 * @param headers Optional array of header strings. If not provided, keys from the first object are used.
 * @returns A string in CSV format.
 */
export const arrayToCsv = (data: any[], headers?: string[]): string => {
    if (!data || data.length === 0) {
        return "";
    }

    const columnHeaders = headers || Object.keys(data[0]);
    const csvRows = [columnHeaders.join(",")];

    for (const row of data) {
        const values = columnHeaders.map(header => {
            const escaped = ('' + row[header]).replace(/"/g, '""'); // Escape double quotes
            return `"${escaped}"`; // Enclose in double quotes
        });
        csvRows.push(values.join(","));
    }

    return csvRows.join("\n");
};

/**
 * Triggers a file download in the browser.
 * @param content The content of the file.
 * @param fileName The desired name for the downloaded file.
 * @param contentType The MIME type of the file.
 */
export const downloadFile = (content: string, fileName: string, contentType: string): void => {
    const a = document.createElement("a");
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    document.body.appendChild(a); // Required for Firefox
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
};


// --- Gemini API Specific Helper ---
const DEFAULT_GEMINI_API_URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
const DEFAULT_MODEL_TEXT = "gemini-1.5-flash-latest"; // Or "gemini-pro" or other compatible models

/**
 * Makes a request to the Gemini API for text generation.
 * @param apiKey The API key for Gemini.
 * @param prompt The user prompt.
 * @param model The model to use (e.g., "gemini-1.5-flash-latest").
 * @returns A promise that resolves with the generated text or an error message.
 */
export const fetchGeminiTextGeneration = async (
    apiKey: string,
    prompt: string,
    model: string = DEFAULT_MODEL_TEXT
): Promise<string> => {
    if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY_HERE" || apiKey.includes("AIzaSyDwjlcdDvgre9mLWR7abRx2qta_NFLISuI")) {
        console.warn("Using placeholder or potentially exposed Gemini API key in fetchGeminiTextGeneration. Please replace with a secure key if this is a production environment.");
        // You might want to return a mock response or throw an error here if the key is invalid for client-side use.
        // For now, let's allow it for local dev with the provided key if it's still there, but log a warning.
    }
     const apiUrl = `${DEFAULT_GEMINI_API_URL_BASE}${model}:generateContent?key=${apiKey}`;
    const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }]
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error("Gemini API Error:", response.status, errorBody);
            throw new Error(`API request failed: ${response.status} - ${errorBody}`);
        }

        const result = await response.json();

        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            return result.candidates[0].content.parts[0].text;
        } else {
            console.error("Unexpected Gemini API response structure:", result);
            throw new Error("No valid text found in Gemini API response.");
        }
    } catch (error) {
        console.error("Error fetching Gemini text generation:", error);
        throw error; // Re-throw to be caught by the caller
    }
};

// Add other general-purpose helper functions as needed.
