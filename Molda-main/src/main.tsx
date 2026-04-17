import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Guard for browsers/webviews with partial Performance API support.
if (typeof window !== 'undefined' && window.performance) {
	const perf = window.performance as Performance & {
		clearMarks?: (name?: string) => void;
		clearMeasures?: (name?: string) => void;
	};
	if (typeof perf.clearMarks !== 'function') {
		perf.clearMarks = () => {};
	}
	if (typeof perf.clearMeasures !== 'function') {
		perf.clearMeasures = () => {};
	}
}

createRoot(document.getElementById("root")!).render(<App />);
