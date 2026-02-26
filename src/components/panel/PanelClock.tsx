import { useState, useEffect, memo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock } from 'lucide-react';

const PanelClock = memo(function PanelClock() {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-3 text-white/80">
      <Clock className="w-5 h-5" />
      <span className="text-lg font-medium">
        {format(currentTime, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
      </span>
      <span className="text-2xl font-bold text-white">
        {format(currentTime, 'HH:mm:ss')}
      </span>
    </div>
  );
});

export default PanelClock;
