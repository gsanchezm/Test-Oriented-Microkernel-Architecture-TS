import { createBrowserRouter } from 'react-router-dom';

import { App } from './App';
import { Overview } from './views/Overview';
import { ToolDetail } from './views/ToolDetail';
import { RootRedirect } from './views/RootRedirect';
import { NotFound } from './views/NotFound';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <RootRedirect /> },
      { path: 'runs', element: <RootRedirect /> },
      { path: 'runs/:runId', element: <Overview /> },
      { path: 'runs/:runId/:toolId', element: <ToolDetail /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
