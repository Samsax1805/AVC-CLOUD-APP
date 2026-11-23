import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend, BarChart, Bar } from 'recharts';
import { lira, PIE_COLORS } from '../utils/helpers';

// The Dashboard's charts, in their own file so the charts library loads after the page appears
export function AttChart({ data, height }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs><linearGradient id="gAtt" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e9a63a" stopOpacity={0.4} /><stop offset="100%" stopColor="#e9a63a" stopOpacity={0.02} /></linearGradient></defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee5d2" vertical={false} />
        <XAxis dataKey="d" tick={{ fontSize: 11, fill: '#8b7f6a' }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#8b7f6a' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e3d8c2', fontSize: 12 }} />
        <Area type="monotone" dataKey="rate" stroke="#d18f26" strokeWidth={2.5} fill="url(#gAtt)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function VoiceChart({ data, height, narrow }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={narrow ? 38 : 46} outerRadius={narrow ? 60 : 72} paddingAngle={3}>
          {data.map((v, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e3d8c2', fontSize: 12 }} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function DuesChart({ data, height }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee5d2" vertical={false} />
        <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#8b7f6a' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#8b7f6a' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e3d8c2', fontSize: 12 }} formatter={(v) => lira(v)} />
        <Bar dataKey="amount" fill="#1a2c60" radius={[6, 6, 0, 0]} maxBarSize={38} />
      </BarChart>
    </ResponsiveContainer>
  );
}
