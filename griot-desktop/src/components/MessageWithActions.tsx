import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { FileModificationsCard } from './FileModificationsCard';

marked.setOptions({ breaks: true, gfm: true });

export function MessageWithActions({ text }: { text: string }) {
  const parts = text.split(/```file_modifications\n([\s\S]*?)\n```/g);
  
  return (
    <div className="md-content">
      {parts.map((part, index) => {
        if (index % 2 === 1) {
          try {
            const data = JSON.parse(part);
            return <FileModificationsCard key={index} data={data} />;
          } catch {
            return <pre key={index}>{part}</pre>;
          }
        }
        const subParts = part.split(/(\[\s*Execute:\s*[^\]]+\s*\])/g);
        return (
          <div key={index}>
            {subParts.map((subPart, subIndex) => {
              const match = subPart.match(/\[\s*Execute:\s*([^\]]+)\s*\]/);
              if (match) {
                return (
                  <button key={subIndex} className="action-btn" type="button" onClick={() => console.log(`Execute ${match[1]}`)}>
                    ▶ Execute: {match[1].trim()}
                  </button>
                );
              }
              const html = DOMPurify.sanitize(marked.parse(subPart) as string);
              return <div key={subIndex} dangerouslySetInnerHTML={{ __html: html }} />;
            })}
          </div>
        );
      })}
    </div>
  );
}
