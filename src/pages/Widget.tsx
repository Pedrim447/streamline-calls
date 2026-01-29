import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContextREST';
import { FloatingWidget } from '@/components/FloatingWidget';
import { Skeleton } from '@/components/ui/skeleton';

export default function Widget() {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/auth');
    }
  }, [user, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center p-4">
        <Skeleton className="h-64 w-80" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background/50 backdrop-blur-sm">
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div className="text-center text-muted-foreground space-y-4">
          <p className="text-sm">
            Arraste o widget para posicioná-lo onde preferir.
          </p>
          <p className="text-xs text-muted-foreground/70">
            Esta página pode ser aberta em uma janela popup separada.
          </p>
        </div>
      </div>
      <FloatingWidget />
    </div>
  );
}
