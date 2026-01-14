'use client';

import './Stack.css';

interface StackItem {
  id: number;
  value: string;
  isFromContinuation?: boolean;
}

interface StackFrame {
  id: number;
  name: string;
  items: StackItem[];
  displayValue?: string;
  isOutputFrame?: boolean;
}

interface StackTower {
  id: number;
  frames: StackFrame[];
}

interface StackProps {
  towers: StackTower[];
  isClearing?: boolean;
  removingItemId?: number | null;
  removingTowerIndex?: number | null;
  removingFrameIndex?: number | null;
  displayValue?: string;
  removingItemIds?: number[];
  pushingItemId?: number | null;
  pushingItemIds?: number[];
  pushingFrameIds?: number[];
  highlightingFrameIds?: number[];
}

function Stack({ towers, isClearing = false, removingItemId = null, removingTowerIndex = null, removingFrameIndex = null, displayValue = '', removingItemIds = [], pushingItemId = null, pushingItemIds = [], pushingFrameIds = [], highlightingFrameIds = [] }: StackProps) {
  return (
    <div className="stack-container">
      {towers.length === 0 && !displayValue ? (
        <div className="stack-empty">
          スタックは空です
        </div>
      ) : (
        <div className="stack-towers">
          {towers.map((tower, towerIndex) => (
            <div key={tower.id} className={`stack-tower ${isClearing ? 'clearing' : ''}`}>
              <div className="stack-frames">
                {tower.frames.map((frame, frameIndex) => {
                  const isPushingFrame = pushingFrameIds.includes(frame.id);
                  const isHighlightingFrame = highlightingFrameIds.includes(frame.id);
                  return (
                  <div key={frame.id} className={`stack-frame ${frame.isOutputFrame ? 'output-frame' : ''} ${isPushingFrame ? 'pushing-frame' : ''} ${isHighlightingFrame ? 'highlighting-frame' : ''}`}>
                    <div className="stack-frame-name">{frame.name}</div>
                    <div className="stack-items">
                      {frame.items.map((item) => {
                        const isRemoving = item.id === removingItemId && 
                                          towerIndex === removingTowerIndex && 
                                          frameIndex === removingFrameIndex;
                        const isShiftRemoving = removingItemIds.includes(item.id);
                        const isResetItem = item.value === '(reset)';
                        const isPushing = item.id === pushingItemId || pushingItemIds.includes(item.id);
                        return (
                          <div 
                            key={item.id} 
                            className={`stack-item ${item.isFromContinuation ? 'from-continuation' : ''} ${isClearing ? 'clearing' : ''} ${isRemoving ? 'removing' : ''} ${isShiftRemoving ? 'shift-removing' : ''} ${isResetItem ? 'reset-item' : ''} ${isPushing ? 'pushing' : ''}`}
                          >
                            {item.value}
                          </div>
                        );
                      })}
                      {frame.displayValue && (
                        <div className="stack-item display-value">
                          {frame.displayValue}
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          ))}
          {displayValue && (
            <div className="stack-item display-value global-output">
              {displayValue}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Stack;
