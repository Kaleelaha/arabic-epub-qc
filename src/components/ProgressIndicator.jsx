export default function ProgressIndicator({ value, label }) {
  return (
    <div className="progress" role="status">
      <div className="bar"><i style={{ width: `${Math.round(value)}%` }} /></div>
      <span>{label} {Math.round(value)}%</span>
    </div>
  );
}
