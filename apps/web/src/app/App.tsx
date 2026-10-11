import { useState } from 'react';
import { Provider } from 'react-redux';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { routes } from './router/routes';
import { useRestoreSession } from './session/useRestoreSession';
import { makeStore } from './store/store';
import './styles/index.css';

const router = createBrowserRouter(routes);

function Root() {
  useRestoreSession();
  return <RouterProvider router={router} />;
}

export function App() {
  const [store] = useState(makeStore);
  return (
    <Provider store={store}>
      <Root />
    </Provider>
  );
}
