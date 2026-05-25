import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="state">
      <div className="title">Page not found</div>
      <Link to="/" className="btn subtle" style={{ marginTop: 8 }}>
        Back to the latest run
      </Link>
    </div>
  );
}
