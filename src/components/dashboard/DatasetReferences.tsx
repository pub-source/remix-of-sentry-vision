import { useState } from 'react';
import { DATASET_REFERENCES } from '@/lib/datasetReferences';
import { Database, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';

const DOMAIN_LABEL: Record<string, string> = {
  'fire-hazard': 'Fire',
  'smoke': 'Smoke',
  'visibility': 'Visibility',
  'facial-expression': 'Facial',
  'context-awareness': 'Context',
  'safety': 'Safety',
  'keywords': 'Keywords',
};

export default function DatasetReferences() {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-card rounded-md border border-border panel-glow">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-secondary/30 transition"
      >
        <div className="flex items-center gap-1.5">
          <Database className="w-3 h-3 text-primary" />
          <span className="text-[10px] font-mono text-primary uppercase tracking-wider">
            Training Data Sources ({DATASET_REFERENCES.length})
          </span>
        </div>
        {open ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1.5 max-h-64 overflow-y-auto">
          <p className="text-[9px] font-mono text-muted-foreground">
            Pretrained models inside this app (face-api, COCO-SSD) are trained on supersets of these public datasets. Fine-tuning targets for crying / shouting / distress.
          </p>
          {DATASET_REFERENCES.map(d => (
            <div key={d.name} className="rounded p-1.5 bg-secondary/20 border border-border">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-accent/20 text-accent shrink-0">
                    {DOMAIN_LABEL[d.domain]}
                  </span>
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-mono font-semibold text-foreground hover:text-primary truncate"
                  >
                    {d.name}
                  </a>
                  <ExternalLink className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                </div>
                <span className="text-[8px] font-mono text-muted-foreground shrink-0">{d.license}</span>
              </div>
              <p className="text-[8px] font-mono text-muted-foreground mt-0.5">{d.size}</p>
              <p className="text-[8px] font-mono text-foreground/70 mt-0.5">{d.notes}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}