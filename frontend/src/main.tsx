import { createRoot } from 'react-dom/client';
const root = document.getElementById('root');
if (!root) throw new Error('Application root missing');
createRoot(root).render(<main><h1>Janela</h1><p>Ambiente em preparação.</p></main>);
