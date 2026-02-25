import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Clock, CheckCircle, Medal } from 'lucide-react';

interface TicketData {
  attendant_id: string | null;
  counter_id: string | null;
  completed_at: string | null;
  service_started_at: string | null;
  status: string;
}

interface ProfileData {
  user_id: string;
  full_name: string;
}

interface CounterData {
  id: string;
  number: number;
  name: string | null;
}

interface RankingEntry {
  attendantName: string;
  counterName: string;
  completedToday: number;
  completedMonth: number;
  avgMinutes: number;
}

export function RankingTab() {
  const [isLoading, setIsLoading] = useState(true);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [period, setPeriod] = useState<'today' | 'month'>('today');

  useEffect(() => {
    fetchRanking();
  }, []);

  const fetchRanking = async () => {
    setIsLoading(true);

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [ticketsRes, profilesRes, countersRes] = await Promise.all([
      supabase
        .from('tickets')
        .select('attendant_id, counter_id, completed_at, service_started_at, status')
        .eq('status', 'completed')
        .gte('completed_at', monthStart),
      supabase.from('profiles').select('user_id, full_name'),
      supabase.from('counters').select('id, number, name'),
    ]);

    const tickets = (ticketsRes.data || []) as TicketData[];
    const profiles = (profilesRes.data || []) as ProfileData[];
    const counters = (countersRes.data || []) as CounterData[];

    const profileMap = new Map(profiles.map(p => [p.user_id, p.full_name]));
    const counterMap = new Map(counters.map(c => [c.id, c.name || `Guichê ${c.number}`]));

    // Group by attendant
    const grouped = new Map<string, {
      attendantName: string;
      counterIds: Set<string>;
      todayCount: number;
      monthCount: number;
      totalMinutes: number;
      totalWithTime: number;
    }>();

    for (const t of tickets) {
      if (!t.attendant_id) continue;

      const key = t.attendant_id;
      if (!grouped.has(key)) {
        grouped.set(key, {
          attendantName: profileMap.get(t.attendant_id) || 'Desconhecido',
          counterIds: new Set(),
          todayCount: 0,
          monthCount: 0,
          totalMinutes: 0,
          totalWithTime: 0,
        });
      }

      const entry = grouped.get(key)!;
      if (t.counter_id) entry.counterIds.add(t.counter_id);
      entry.monthCount++;

      if (t.completed_at?.startsWith(todayStr)) {
        entry.todayCount++;
      }

      if (t.service_started_at && t.completed_at) {
        const start = new Date(t.service_started_at).getTime();
        const end = new Date(t.completed_at).getTime();
        const minutes = (end - start) / 60000;
        if (minutes > 0 && minutes < 480) { // ignore outliers > 8h
          entry.totalMinutes += minutes;
          entry.totalWithTime++;
        }
      }
    }

    const result: RankingEntry[] = Array.from(grouped.values()).map(e => ({
      attendantName: e.attendantName,
      counterName: Array.from(e.counterIds).map(id => counterMap.get(id) || '?').join(', ') || '-',
      completedToday: e.todayCount,
      completedMonth: e.monthCount,
      avgMinutes: e.totalWithTime > 0 ? Math.round((e.totalMinutes / e.totalWithTime) * 10) / 10 : 0,
    }));

    // Sort by the relevant period
    result.sort((a, b) => b.completedMonth - a.completedMonth);

    setRanking(result);
    setIsLoading(false);
  };

  const sorted = useMemo(() => {
    const copy = [...ranking];
    if (period === 'today') {
      copy.sort((a, b) => b.completedToday - a.completedToday);
    } else {
      copy.sort((a, b) => b.completedMonth - a.completedMonth);
    }
    return copy;
  }, [ranking, period]);

  const getMedalIcon = (index: number) => {
    if (index === 0) return <Trophy className="h-5 w-5 text-yellow-500" />;
    if (index === 1) return <Medal className="h-5 w-5 text-gray-400" />;
    if (index === 2) return <Medal className="h-5 w-5 text-amber-700" />;
    return <span className="text-sm text-muted-foreground w-5 text-center inline-block">{index + 1}</span>;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          Ranking de Atendimento
        </CardTitle>
        <CardDescription>
          Desempenho dos atendentes por guichê
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as 'today' | 'month')} className="mb-4">
          <TabsList>
            <TabsTrigger value="today">Hoje</TabsTrigger>
            <TabsTrigger value="month">Este Mês</TabsTrigger>
          </TabsList>
        </Tabs>

        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum atendimento finalizado encontrado.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Atendente</TableHead>
                <TableHead>Guichê(s)</TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <CheckCircle className="h-4 w-4" />
                    Hoje
                  </div>
                </TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <CheckCircle className="h-4 w-4" />
                    Mês
                  </div>
                </TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Clock className="h-4 w-4" />
                    Média (min)
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((entry, i) => (
                <TableRow key={i}>
                  <TableCell>{getMedalIcon(i)}</TableCell>
                  <TableCell className="font-medium">{entry.attendantName}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{entry.counterName}</Badge>
                  </TableCell>
                  <TableCell className="text-center font-semibold">{entry.completedToday}</TableCell>
                  <TableCell className="text-center font-semibold">{entry.completedMonth}</TableCell>
                  <TableCell className="text-center">
                    {entry.avgMinutes > 0 ? (
                      <Badge variant={entry.avgMinutes <= 10 ? 'default' : 'secondary'}>
                        {entry.avgMinutes} min
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
