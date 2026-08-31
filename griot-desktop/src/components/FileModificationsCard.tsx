import { useState } from 'react';

export function FileModificationsCard({ data }: { data: any }) {
  const files = data.files || [];
  const [expanded, setExpanded] = useState(false);
  const displayFiles = expanded ? files : files.slice(0, 3);

  return (
    <div className="file-modifications-card">
      <div className="fmc-header">
        <div className="fmc-info">
          <div className="fmc-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
          <div>
            <div className="fmc-title">{files.length || data.total || 0} fichiers modifiés</div>
            <div className="fmc-stats">
              <span className="fmc-add">+{data.additions || 0}</span>
              <span className="fmc-del">-{data.deletions || 0}</span>
            </div>
          </div>
        </div>
        <div className="fmc-actions">
          <button className="btn-cancel" type="button">Annuler ↩</button>
          <button className="btn-review" type="button">Examiner</button>
        </div>
      </div>
      {files.length > 0 && (
        <div className="fmc-files">
          {displayFiles.map((f: any, i: number) => (
            <div key={i} className="fmc-file-row">
              <span className="fmc-file-path">{f.path || f}</span>
              <span className="fmc-file-diff">
                {f.additions !== undefined && <span className="fmc-add">+{f.additions}</span>}
                {f.deletions !== undefined && <span className="fmc-del">-{f.deletions}</span>}
              </span>
            </div>
          ))}
          {files.length > 3 && !expanded && (
            <div className="fmc-show-more" onClick={() => setExpanded(true)}>
              Afficher {files.length - 3} autres fichiers
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
