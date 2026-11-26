/* =========================================================================
   E-WIP THEME REGISTRY & LIVE SWITCHER ENGINE (PURE JAVASCRIPT)
   Manages 8 built-in themes + smooth transitions + localStorage + live Chart/UI sync
   ========================================================================= */

(function () {
    const STORAGE_KEY = 'ewip_active_theme';
    const DEFAULT_THEME_ID = 'royal-batik';

    const EWIP_THEMES = {
        'default': {
            id: 'default',
            name: 'Default Terang',
            shortName: 'Default',
            subtitle: 'Klasik bersih & terang — kontras tinggi siang hari',
            badge: 'Light',
            mode: 'light',
            useBatikPatterns: false,
            showGunungan: false,
            swatches: ['#f3f5f9', '#ffffff', '#4f46e5', '#10b981'],
            chart: {
                plotBgTop: 'rgba(248, 250, 252, 0.55)',
                plotBgBottom: 'rgba(241, 245, 249, 0.35)',
                plotWatermark: null,
                plotCorners: null,
                gridColor: 'rgba(148, 163, 184, 0.24)',
                borderColor: 'rgba(148, 163, 184, 0.45)',
                tickColor: '#475569',
                tooltipBg: 'rgba(15, 23, 42, 0.94)',
                tooltipBorder: '#4f46e5',
                tooltipTitle: '#f8fafc',
                tooltipBody: '#e2e8f0',
                delayZoneBg: 'rgba(239, 68, 68, 0.09)',
                delayZoneHatch: 'rgba(239, 68, 68, 0.12)',
                delayDivider: '#ef4444',
                delayLabel: '#dc2626',
                donutCenterBg: '#ffffff',
                donutRingOuter: 'rgba(148, 163, 184, 0.38)',
                donutRingInner: 'rgba(148, 163, 184, 0.22)',
                donutRays: null,
                donutPctColor: '#0f172a',
                donutSubColor: '#64748b',
                trendLine: '#4f46e5',
                trendAreaTop: 'rgba(79, 70, 229, 0.24)',
                trendAreaBottom: 'rgba(79, 70, 229, 0.01)',
                trendRegression: '#f97316',
                barTrend: '#1e293b',
                pointBg: '#ffffff',
                pointBorder: '#4f46e5',
                sliceBorder: '#ffffff',
                sliceHoverBorder: '#1e293b',
                datalabelText: '#ffffff',
                datalabelBg: 'rgba(15, 23, 42, 0.72)',
                series: {
                    sched: { fill: '#3b82f6', border: '#2563eb' },
                    shOnsched: { fill: '#f59e0b', border: '#d97706' },
                    delay: { fill: '#ef4444', border: '#dc2626' },
                    shDelay: { fill: '#991b1b', border: '#7f1d1d' }
                },
                legendCaption: 'Biru = On-Sched • Oranye = Potensi SH • Merah = Delay • Marun = Delay SH'
            },
            export: {
                bg: '#f8fafc',
                border: '#cbd5e1',
                title: '#0f172a',
                subtitle: '#475569',
                thBg: '#f1f5f9',
                thText: '#334155',
                bodyText: '#0f172a',
                tableBg: '#ffffff',
                cellBorder: '#cbd5e1'
            },
            ui: {
                navInactive: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-slate-600 hover:text-indigo-700 hover:bg-white border border-transparent whitespace-nowrap shrink-0',
                navInactivePaylater: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-slate-600 hover:text-purple-700 hover:bg-white border border-transparent flex items-center gap-1 whitespace-nowrap shrink-0',
                navInactiveRocket: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-slate-600 hover:text-pink-700 hover:bg-white border border-transparent flex items-center gap-1 whitespace-nowrap shrink-0',
                navActive: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-indigo-600 text-white shadow-sm border border-indigo-700 whitespace-nowrap shrink-0',
                navActivePaylater: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-purple-600 text-white shadow-sm border border-purple-700 flex items-center gap-1 whitespace-nowrap shrink-0',
                navActiveRocket: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-pink-600 text-white shadow-sm border border-pink-700 flex items-center gap-1 whitespace-nowrap shrink-0',
                navMasterIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0',
                navInputIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-white bg-indigo-600 hover:bg-indigo-700 border border-indigo-700 flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0',
                navActionActive: 'px-3 py-1.5 rounded-md text-xs font-extrabold transition text-white bg-indigo-700 shadow-md border border-indigo-800 flex items-center gap-1.5 whitespace-nowrap shrink-0',
                catActive: 'bg-indigo-600 text-white shadow-sm border border-indigo-700 font-bold',
                catInactive: 'text-slate-600 hover:text-indigo-700 hover:bg-white border border-transparent',
                closedCard: 'border-emerald-200 bg-emerald-50/70 hover:border-emerald-400 hover:bg-emerald-50',
                closedTitle: 'text-slate-900',
                closedSub: 'text-emerald-700',
                closedChip: 'bg-white border-emerald-200 text-slate-600',
                closedChipVal: 'text-slate-900',
                cnd3Card: 'bg-red-50/80 border-red-200 text-red-700 hover:border-red-400',
                cnd2Card: 'bg-amber-50/80 border-amber-200 text-amber-700 hover:border-amber-400',
                cndTitle: 'text-slate-900',
                shArrivedCard: 'bg-slate-50 border-slate-200 opacity-75 hover:opacity-100',
                shOpenCard: 'bg-amber-50 border-amber-300 hover:border-amber-500',
                shArrivedBadge: 'text-emerald-700 bg-emerald-100 border-emerald-300',
                shOpenBadge: 'text-red-700 bg-red-100 border-red-300',
                chartHeader: 'bg-slate-50 border-slate-200',
                chartTitle: 'text-slate-800',
                chartSub: 'text-slate-500',
                chartTotalBox: 'text-slate-600 border-slate-200 bg-white',
                chartTotalVal: 'text-indigo-700',
                chartDivider: 'bg-slate-200',
                chartLegendBox: 'bg-slate-50 border-slate-200 hover:border-indigo-300',
                legendSchedCard: 'text-blue-700 bg-blue-50 border-blue-200 hover:border-blue-400',
                legendSchedLabel: 'text-blue-600',
                legendSchedVal: 'text-blue-950',
                legendSchedSh: 'bg-amber-100 text-amber-800 border-amber-300',
                legendSchedPct: 'bg-white text-blue-700 border-blue-200',
                legendDelayCard: 'text-red-700 bg-red-50 border-red-200 hover:border-red-400',
                legendDelayLabel: 'text-red-600',
                legendDelayVal: 'text-red-950',
                legendDelaySh: 'bg-red-100 text-red-800 border-red-300',
                legendDelayPct: 'bg-white text-red-700 border-red-200',
                legendMeta: 'text-slate-500',
                matrixPctCell: 'text-indigo-800 bg-slate-50 border-slate-300',
                matrixDelayRemark: 'text-red-900 bg-red-100',
                matrixSchedRemark: 'text-blue-900 bg-blue-100',
                matrixPeriodCell: 'text-slate-600 bg-slate-50 border-slate-200',
                matrixWppCell: 'text-slate-900 bg-slate-100 border-slate-200',
                matrixOkLabel: 'text-blue-900 bg-blue-50 border-blue-200',
                matrixOkCell: 'text-slate-800 bg-white',
                matrixOkTotal: 'bg-blue-100 text-blue-950',
                matrixShLabel: 'text-red-900 bg-red-50 border-red-200',
                matrixShCell: 'text-red-700 bg-red-50/40',
                matrixShTotal: 'bg-red-200 text-red-950',
                matrixRiwLabel: 'text-amber-900 bg-amber-50 border-amber-200',
                matrixRiwCell: 'text-amber-800 bg-amber-50/40',
                matrixRiwTotal: 'bg-amber-200 text-amber-950',
                matrixFooterSched: 'text-emerald-800 bg-emerald-50',
                matrixFooterDelay: 'text-red-800 bg-red-50',
                matrixFooterPct: 'text-indigo-900 bg-indigo-50',
                matrixFooterPctVal: 'bg-indigo-100 text-indigo-950',
                matrixEmptyCell: 'bg-slate-50',
                recapWrap: 'bg-white border-slate-200',
                recapTh: 'bg-slate-100 text-slate-700 border-slate-200',
                recapRow: 'border-slate-200 hover:bg-slate-50',
                recapText: 'text-slate-800',
                recapMuted: 'text-slate-500'
            }
        },

        'royal-batik': {
            id: 'royal-batik',
            name: 'Royal Batik Sogan',
            shortName: 'Royal Batik',
            subtitle: 'Coklat sogan gelap & emas prada keraton + motif batik',
            badge: 'Batik',
            mode: 'dark',
            useBatikPatterns: true,
            showGunungan: true,
            swatches: ['#120a05', '#27170e', '#d4a843', '#96211e'],
            chart: {
                plotBgTop: 'rgba(32, 19, 11, 0.55)',
                plotBgBottom: 'rgba(18, 10, 5, 0.72)',
                plotWatermark: 'rgba(212, 168, 67, 0.065)',
                plotCorners: 'rgba(244, 212, 124, 0.42)',
                gridColor: 'rgba(212, 168, 67, 0.14)',
                borderColor: 'rgba(212, 168, 67, 0.32)',
                tickColor: '#d6be93',
                tooltipBg: 'rgba(23, 13, 7, 0.96)',
                tooltipBorder: '#d4a843',
                tooltipTitle: '#f4d47c',
                tooltipBody: '#f7ebd4',
                delayZoneBg: 'rgba(145, 28, 28, 0.24)',
                delayZoneHatch: 'rgba(229, 169, 68, 0.14)',
                delayDivider: '#e8be59',
                delayLabel: '#fda4af',
                donutCenterBg: '#190e07',
                donutRingOuter: 'rgba(244, 212, 124, 0.65)',
                donutRingInner: 'rgba(212, 168, 67, 0.35)',
                donutRays: 'rgba(244, 212, 124, 0.45)',
                donutPctColor: '#f4d47c',
                donutSubColor: '#cbb184',
                trendLine: '#f4d47c',
                trendAreaTop: 'rgba(212, 168, 67, 0.44)',
                trendAreaBottom: 'rgba(212, 168, 67, 0.02)',
                trendRegression: '#e07b47',
                barTrend: '#fce49c',
                pointBg: '#1a0e07',
                pointBorder: '#f7dc88',
                sliceBorder: '#170d07',
                sliceHoverBorder: '#f4d47c',
                datalabelText: '#fff8e1',
                datalabelBg: 'rgba(20, 11, 5, 0.70)',
                series: {
                    sched: { motif: 'kawung', base: '#b3811e', stroke: '#f8de93', accent: '#291608', border: 'rgba(248,222,147,0.75)' },
                    shOnsched: { motif: 'nitik', base: '#bd641a', stroke: '#fde293', accent: '#fff4cc', border: 'rgba(253,226,147,0.55)' },
                    delay: { motif: 'parang', base: '#96211e', stroke: '#eab354', accent: '#f8d77f', border: 'rgba(244,212,124,0.5)' },
                    shDelay: { motif: 'ceplok', base: '#541115', stroke: '#d99e3a', accent: '#f5d47a', border: 'rgba(217,158,58,0.55)' }
                },
                legendCaption: 'Motif Batik Kawung (Emas) = On-Sched • Nitik (Tembaga) = Potensi SH • Parang (Marun) = Delay • Ceplok = Delay SH'
            },
            export: {
                bg: '#140b06',
                border: '#d4a843',
                title: '#f4d47c',
                subtitle: '#cbb184',
                thBg: '#2c190d',
                thText: '#f4d47c',
                bodyText: '#f7ebd4',
                tableBg: '#1c1008',
                cellBorder: 'rgba(212,168,67,0.4)'
            },
            ui: {
                navInactive: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#d6be93] hover:text-[#f4d47c] border border-transparent whitespace-nowrap shrink-0',
                navInactivePaylater: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#d6be93] hover:text-[#dfb4ff] border border-transparent flex items-center gap-1 whitespace-nowrap shrink-0',
                navInactiveRocket: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#d6be93] hover:text-[#f9a8d4] border border-transparent flex items-center gap-1 whitespace-nowrap shrink-0',
                navActive: 'px-3 py-1.5 rounded-md text-xs font-extrabold transition text-[#1a0e06] bg-gradient-to-r from-[#c9952a] via-[#f6d983] to-[#c9952a] border border-[#fff2bf]/70 shadow-md whitespace-nowrap shrink-0',
                navActivePaylater: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-[#3b1c54] shadow-sm text-[#dfb4ff] border border-[#c084fc]/60 flex items-center gap-1 whitespace-nowrap shrink-0',
                navActiveRocket: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-[#4e182e] shadow-sm text-[#f9a8d4] border border-[#f472b6]/60 flex items-center gap-1 whitespace-nowrap shrink-0',
                navMasterIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#f4d47c] bg-[#2c1a0e] hover:bg-[#3d2514] border border-[#d4a843]/50 flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0',
                navInputIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#1a0e06] bg-gradient-to-r from-[#c7942a] via-[#f0cb6e] to-[#c7942a] hover:brightness-110 border border-[#fff2bf]/60 flex items-center gap-1.5 shadow-md whitespace-nowrap shrink-0',
                navActionActive: 'px-3 py-1.5 rounded-md text-xs font-extrabold transition text-[#1a0e06] bg-gradient-to-r from-[#c9952a] via-[#f6d983] to-[#c9952a] shadow-md border border-[#fff2bf]/70 flex items-center gap-1.5 whitespace-nowrap shrink-0',
                catActive: 'bg-gradient-to-r from-[#c7942a] via-[#f0cb6e] to-[#c7942a] text-[#1a0e06] shadow border border-[#fff2bf]/70 font-extrabold',
                catInactive: 'text-[#d6be93] hover:text-[#f4d47c] hover:bg-[#2c1a0e] border border-transparent',
                closedCard: 'border-[#34d399]/30 bg-[#14271c] hover:border-[#34d399]/70 hover:bg-[#193324]',
                closedTitle: 'text-[#f7ebd4]',
                closedSub: 'text-[#6ee7b7]',
                closedChip: 'bg-[#120a05]/80 border-[#d4a843]/25 text-[#cbb184]',
                closedChipVal: 'text-[#f7ebd4]',
                cnd3Card: 'bg-[#2d1312] border-[#ef4444]/40 text-[#fda4af] hover:border-[#f87171]',
                cnd2Card: 'bg-[#2e1e0d] border-[#f59e0b]/40 text-[#fcd34d] hover:border-[#fbbf24]',
                cndTitle: 'text-[#f7ebd4]',
                shArrivedCard: 'bg-[#1a1009] border-[#d4a843]/20 opacity-70 hover:opacity-100',
                shOpenCard: 'bg-[#2c1c0c] border-[#f4d47c]/40 hover:border-[#f4d47c]',
                shArrivedBadge: 'text-[#6ee7b7] bg-[#11422e] border-[#34d399]/40',
                shOpenBadge: 'text-[#fecdd3] bg-[#7f1d1d] border-[#f87171]/50',
                chartHeader: 'bg-[#1e1108] border-[#d4a843]/30',
                chartTitle: 'text-[#f4d47c]',
                chartSub: 'text-[#ab8f63]',
                chartTotalBox: 'text-[#cbb184] border-[#d4a843]/45 bg-[#150c06]',
                chartTotalVal: 'text-[#f4d47c]',
                chartDivider: 'bg-[#d4a843]/25',
                chartLegendBox: 'bg-[#170d07] border-[#d4a843]/35 hover:border-[#f4d47c]/70',
                legendSchedCard: 'text-[#f4d47c] bg-[#2a1c0b] border-[#d4a843]/45 hover:border-[#f4d47c] hover:bg-[#36230d]',
                legendSchedLabel: 'text-[#cbb184]',
                legendSchedVal: 'text-[#fff3c4]',
                legendSchedSh: 'bg-[#4d2c0f] text-[#fde08d] border-[#e09f3e]/50',
                legendSchedPct: 'bg-[#150c06] text-[#f4d47c] border-[#d4a843]/50',
                legendDelayCard: 'text-[#fda4af] bg-[#2d1312] border-[#ef4444]/45 hover:border-[#f87171] hover:bg-[#3d1917]',
                legendDelayLabel: 'text-[#e5a3a8]',
                legendDelayVal: 'text-[#ffe4e6]',
                legendDelaySh: 'bg-[#4c1518] text-[#fde08d] border-[#f87171]/45',
                legendDelayPct: 'bg-[#150c06] text-[#fda4af] border-[#ef4444]/50',
                legendMeta: 'text-[#ab8f63]',
                matrixPctCell: 'text-[#f4d47c] bg-[#1c1008] border-[#d4a843]/40',
                matrixDelayRemark: 'text-[#fecdd3] bg-[#4a1616]',
                matrixSchedRemark: 'text-[#fce49c] bg-[#3d280d]',
                matrixPeriodCell: 'text-[#d6be93] bg-[#1d1109] border-[#d4a843]/35',
                matrixWppCell: 'text-[#f4d47c] bg-[#28170c] border-[#d4a843]/35',
                matrixOkLabel: 'text-[#fce49c] bg-[#3f2a0f] border-[#d4a843]/45',
                matrixOkCell: 'text-[#f7ebd4] bg-[#2a1c0d]',
                matrixOkTotal: 'bg-[#4a3212] text-[#fff2bf]',
                matrixShLabel: 'text-[#fecdd3] bg-[#541717] border-[#ef4444]/45',
                matrixShCell: 'text-[#fda4af] bg-[#331313]',
                matrixShTotal: 'bg-[#691c1c] text-[#ffe4e6]',
                matrixRiwLabel: 'text-[#fde68a] bg-[#4c2e0e] border-[#f59e0b]/45',
                matrixRiwCell: 'text-[#fcd34d] bg-[#2e1d0b]',
                matrixRiwTotal: 'bg-[#633c11] text-[#fef3c7]',
                matrixFooterSched: 'text-[#6ee7b7] bg-[#13291e]',
                matrixFooterDelay: 'text-[#fda4af] bg-[#361313]',
                matrixFooterPct: 'text-[#f4d47c] bg-[#3a2510]',
                matrixFooterPctVal: 'bg-[#4f3414] text-[#fff3c4]',
                matrixEmptyCell: 'bg-[#1b1008]',
                recapWrap: 'bg-[#190e07] border-[#d4a843]/25',
                recapTh: 'bg-[#2c1a0e] text-[#f4d47c] border-[#d4a843]/30',
                recapRow: 'border-[#d4a843]/20 hover:bg-[#2d1c10]',
                recapText: 'text-[#f7ebd4]',
                recapMuted: 'text-[#cbb184]'
            }
        },

        'batik-ivory': {
            id: 'batik-ivory',
            name: 'Batik Keraton Pagi',
            shortName: 'Batik Pagi',
            subtitle: 'Krem gading hangat & coklat sogan — batik versi terang',
            badge: 'Batik Light',
            mode: 'light',
            useBatikPatterns: true,
            showGunungan: true,
            swatches: ['#f6efe0', '#fffdf7', '#8c5a12', '#9e2620'],
            chart: {
                plotBgTop: 'rgba(255, 251, 240, 0.72)',
                plotBgBottom: 'rgba(246, 236, 214, 0.55)',
                plotWatermark: 'rgba(140, 90, 24, 0.065)',
                plotCorners: 'rgba(166, 111, 25, 0.45)',
                gridColor: 'rgba(160, 114, 42, 0.16)',
                borderColor: 'rgba(160, 114, 42, 0.35)',
                tickColor: '#5c3c22',
                tooltipBg: 'rgba(42, 24, 11, 0.95)',
                tooltipBorder: '#d4a843',
                tooltipTitle: '#f5d882',
                tooltipBody: '#fff8e8',
                delayZoneBg: 'rgba(168, 36, 30, 0.11)',
                delayZoneHatch: 'rgba(168, 36, 30, 0.13)',
                delayDivider: '#b91c1c',
                delayLabel: '#991b1b',
                donutCenterBg: '#fffdf7',
                donutRingOuter: 'rgba(166, 111, 25, 0.55)',
                donutRingInner: 'rgba(166, 111, 25, 0.3)',
                donutRays: 'rgba(181, 129, 36, 0.35)',
                donutPctColor: '#4f2e10',
                donutSubColor: '#846243',
                trendLine: '#9a6614',
                trendAreaTop: 'rgba(181, 129, 36, 0.28)',
                trendAreaBottom: 'rgba(181, 129, 36, 0.02)',
                trendRegression: '#c2410c',
                barTrend: '#4f2e10',
                pointBg: '#fffdf7',
                pointBorder: '#9a6614',
                sliceBorder: '#fffdf7',
                sliceHoverBorder: '#5c330c',
                datalabelText: '#fffdf7',
                datalabelBg: 'rgba(42, 24, 11, 0.74)',
                series: {
                    sched: { motif: 'kawung', base: '#a67418', stroke: '#fce6a6', accent: '#3d2409', border: 'rgba(140,90,18,0.85)' },
                    shOnsched: { motif: 'nitik', base: '#c46418', stroke: '#fde4a3', accent: '#fff4d4', border: 'rgba(180,83,9,0.7)' },
                    delay: { motif: 'parang', base: '#a32220', stroke: '#f2c46d', accent: '#fae09e', border: 'rgba(153,27,27,0.75)' },
                    shDelay: { motif: 'ceplok', base: '#611418', stroke: '#e5b254', accent: '#fae09e', border: 'rgba(97,20,24,0.85)' }
                },
                legendCaption: 'Batik Kawung (Emas Sogan) = On-Sched • Nitik (Tembaga) = Potensi SH • Parang (Marun) = Delay • Ceplok = Delay SH'
            },
            export: {
                bg: '#f6efe0',
                border: '#b58124',
                title: '#4f2e10',
                subtitle: '#7a542e',
                thBg: '#efe2c8',
                thText: '#4f2e10',
                bodyText: '#2a180b',
                tableBg: '#fffdf7',
                cellBorder: 'rgba(160,114,42,0.38)'
            },
            ui: {
                navInactive: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#6e4b2b] hover:text-[#3d2108] hover:bg-[#fffdf7] border border-transparent whitespace-nowrap shrink-0',
                navInactivePaylater: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#6e4b2b] hover:text-purple-800 hover:bg-[#fffdf7] border border-transparent flex items-center gap-1 whitespace-nowrap shrink-0',
                navInactiveRocket: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#6e4b2b] hover:text-pink-800 hover:bg-[#fffdf7] border border-transparent flex items-center gap-1 whitespace-nowrap shrink-0',
                navActive: 'px-3 py-1.5 rounded-md text-xs font-extrabold transition text-[#fce7a8] bg-gradient-to-r from-[#5c3513] to-[#3f220a] border border-[#b58124] shadow-sm whitespace-nowrap shrink-0',
                navActivePaylater: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-purple-800 text-purple-50 shadow-sm border border-purple-900 flex items-center gap-1 whitespace-nowrap shrink-0',
                navActiveRocket: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-pink-800 text-pink-50 shadow-sm border border-pink-900 flex items-center gap-1 whitespace-nowrap shrink-0',
                navMasterIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#5c330c] bg-[#fffdf7] hover:bg-[#f5e7c9] border border-[#b58124]/50 flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0',
                navInputIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#fce7a8] bg-gradient-to-r from-[#6b3f16] to-[#47280d] hover:brightness-110 border border-[#b58124] flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0',
                navActionActive: 'px-3 py-1.5 rounded-md text-xs font-extrabold transition text-[#fce7a8] bg-gradient-to-r from-[#5c3513] to-[#3a1f09] shadow-md border border-[#d4a843] flex items-center gap-1.5 whitespace-nowrap shrink-0',
                catActive: 'bg-[#5c3513] text-[#fce7a8] shadow-sm border border-[#b58124] font-bold',
                catInactive: 'text-[#6e4b2b] hover:text-[#3d2108] hover:bg-[#fffdf7] border border-transparent',
                closedCard: 'border-emerald-300/70 bg-emerald-50/80 hover:border-emerald-500',
                closedTitle: 'text-[#2a180b]',
                closedSub: 'text-emerald-800',
                closedChip: 'bg-[#fffdf7] border-emerald-200 text-[#5c3c22]',
                closedChipVal: 'text-[#2a180b]',
                cnd3Card: 'bg-[#fceceb] border-red-300 text-red-800 hover:border-red-500',
                cnd2Card: 'bg-[#fef3dc] border-amber-300 text-amber-800 hover:border-amber-500',
                cndTitle: 'text-[#2a180b]',
                shArrivedCard: 'bg-[#f6efe0] border-[#b58124]/25 opacity-75 hover:opacity-100',
                shOpenCard: 'bg-[#fcf1d8] border-[#b58124]/50 hover:border-[#8c5a12]',
                shArrivedBadge: 'text-emerald-800 bg-emerald-100 border-emerald-300',
                shOpenBadge: 'text-red-800 bg-red-100 border-red-300',
                chartHeader: 'bg-[#faf2e1] border-[#b58124]/30',
                chartTitle: 'text-[#4f2e10]',
                chartSub: 'text-[#846243]',
                chartTotalBox: 'text-[#785430] border-[#b58124]/45 bg-[#fffdf7]',
                chartTotalVal: 'text-[#5c330c]',
                chartDivider: 'bg-[#b58124]/25',
                chartLegendBox: 'bg-[#faf2e1] border-[#b58124]/32 hover:border-[#8c5a12]',
                legendSchedCard: 'text-[#6e4514] bg-[#fcf3db] border-[#b58124]/45 hover:border-[#8c5a12]',
                legendSchedLabel: 'text-[#846243]',
                legendSchedVal: 'text-[#3d2108]',
                legendSchedSh: 'bg-[#f5dfa9] text-[#6e3b09] border-[#c48d2a]',
                legendSchedPct: 'bg-[#fffdf7] text-[#6e4514] border-[#b58124]/50',
                legendDelayCard: 'text-red-800 bg-[#fceceb] border-red-300 hover:border-red-500',
                legendDelayLabel: 'text-red-700',
                legendDelayVal: 'text-red-950',
                legendDelaySh: 'bg-red-100 text-red-900 border-red-300',
                legendDelayPct: 'bg-[#fffdf7] text-red-800 border-red-300',
                legendMeta: 'text-[#785430]',
                matrixPctCell: 'text-[#5c330c] bg-[#faf2e1] border-[#b58124]/40',
                matrixDelayRemark: 'text-red-900 bg-[#f8d7d5]',
                matrixSchedRemark: 'text-[#5c3905] bg-[#f5e3b8]',
                matrixPeriodCell: 'text-[#6e4b2b] bg-[#faf2e1] border-[#b58124]/30',
                matrixWppCell: 'text-[#4f2e10] bg-[#f3e5c7] border-[#b58124]/30',
                matrixOkLabel: 'text-[#5c3905] bg-[#f7e7c0] border-[#b58124]/40',
                matrixOkCell: 'text-[#2a180b] bg-[#fffdf7]',
                matrixOkTotal: 'bg-[#efd8a3] text-[#3d2108]',
                matrixShLabel: 'text-red-900 bg-[#fadbd9] border-red-300',
                matrixShCell: 'text-red-800 bg-[#fdf3f2]',
                matrixShTotal: 'bg-[#f4bdbc] text-red-950',
                matrixRiwLabel: 'text-amber-900 bg-[#fae7bf] border-amber-300',
                matrixRiwCell: 'text-amber-900 bg-[#fdf7ea]',
                matrixRiwTotal: 'bg-[#f2d08c] text-amber-950',
                matrixFooterSched: 'text-emerald-900 bg-[#e2f5ea]',
                matrixFooterDelay: 'text-red-900 bg-[#fbe4e3]',
                matrixFooterPct: 'text-[#5c330c] bg-[#f3e4c3]',
                matrixFooterPctVal: 'bg-[#e6cc95] text-[#3d2108]',
                matrixEmptyCell: 'bg-[#f6efe0]',
                recapWrap: 'bg-[#fffdf7] border-[#b58124]/30',
                recapTh: 'bg-[#f3e5c7] text-[#4f2e10] border-[#b58124]/35',
                recapRow: 'border-[#b58124]/22 hover:bg-[#faf2e1]',
                recapText: 'text-[#2a180b]',
                recapMuted: 'text-[#785430]'
            }
        },

        'industrial-dark': {
            id: 'industrial-dark',
            name: 'Industrial Dark Slate',
            shortName: 'Dark Slate',
            subtitle: 'Minimalis ruang kontrol pabrik — modern, tajam, fokus data',
            badge: 'Dark',
            mode: 'dark',
            useBatikPatterns: false,
            showGunungan: false,
            swatches: ['#0b1120', '#131c31', '#38bdf8', '#f43f5e'],
            chart: {
                plotBgTop: 'rgba(15, 23, 42, 0.55)',
                plotBgBottom: 'rgba(11, 17, 32, 0.72)',
                plotWatermark: null,
                plotCorners: null,
                gridColor: 'rgba(148, 163, 184, 0.14)',
                borderColor: 'rgba(148, 163, 184, 0.28)',
                tickColor: '#94a3b8',
                tooltipBg: 'rgba(15, 23, 42, 0.96)',
                tooltipBorder: '#38bdf8',
                tooltipTitle: '#7dd3fc',
                tooltipBody: '#f1f5f9',
                delayZoneBg: 'rgba(244, 63, 94, 0.16)',
                delayZoneHatch: 'rgba(244, 63, 94, 0.12)',
                delayDivider: '#fb7185',
                delayLabel: '#fda4af',
                donutCenterBg: '#0f172a',
                donutRingOuter: 'rgba(56, 189, 248, 0.55)',
                donutRingInner: 'rgba(148, 163, 184, 0.28)',
                donutRays: null,
                donutPctColor: '#7dd3fc',
                donutSubColor: '#94a3b8',
                trendLine: '#38bdf8',
                trendAreaTop: 'rgba(56, 189, 248, 0.34)',
                trendAreaBottom: 'rgba(56, 189, 248, 0.01)',
                trendRegression: '#f59e0b',
                barTrend: '#e0f2fe',
                pointBg: '#0b1120',
                pointBorder: '#38bdf8',
                sliceBorder: '#0f172a',
                sliceHoverBorder: '#7dd3fc',
                datalabelText: '#f8fafc',
                datalabelBg: 'rgba(11, 17, 32, 0.74)',
                series: {
                    sched: { fill: '#0ea5e9', border: '#38bdf8' },
                    shOnsched: { fill: '#f59e0b', border: '#fbbf24' },
                    delay: { fill: '#e11d48', border: '#fb7185' },
                    shDelay: { fill: '#881337', border: '#f43f5e' }
                },
                legendCaption: 'Cyan = On-Sched • Amber = Potensi SH • Crimson = Delay • Dark Rose = Delay SH'
            },
            export: {
                bg: '#0b1120',
                border: '#38bdf8',
                title: '#7dd3fc',
                subtitle: '#94a3b8',
                thBg: '#1e293b',
                thText: '#93c5fd',
                bodyText: '#f1f5f9',
                tableBg: '#131c31',
                cellBorder: 'rgba(148,163,184,0.3)'
            },
            ui: {
                navInactive: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-slate-300 hover:text-sky-300 border border-transparent whitespace-nowrap shrink-0',
                navInactivePaylater: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-slate-300 hover:text-purple-300 border border-transparent flex items-center gap-1 whitespace-nowrap shrink-0',
                navInactiveRocket: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-slate-300 hover:text-pink-300 border border-transparent flex items-center gap-1 whitespace-nowrap shrink-0',
                navActive: 'px-3 py-1.5 rounded-md text-xs font-extrabold transition text-slate-950 bg-sky-400 border border-sky-300 shadow-md whitespace-nowrap shrink-0',
                navActivePaylater: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-purple-900/90 text-purple-200 border border-purple-400/60 flex items-center gap-1 whitespace-nowrap shrink-0',
                navActiveRocket: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-pink-900/90 text-pink-200 border border-pink-400/60 flex items-center gap-1 whitespace-nowrap shrink-0',
                navMasterIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-sky-300 bg-slate-800 hover:bg-slate-700 border border-slate-600 flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0',
                navInputIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:brightness-110 border border-sky-400/60 flex items-center gap-1.5 shadow-md whitespace-nowrap shrink-0',
                navActionActive: 'px-3 py-1.5 rounded-md text-xs font-extrabold transition text-slate-950 bg-sky-400 shadow-md border border-sky-200 flex items-center gap-1.5 whitespace-nowrap shrink-0',
                catActive: 'bg-sky-400 text-slate-950 shadow border border-sky-200 font-extrabold',
                catInactive: 'text-slate-300 hover:text-sky-300 hover:bg-slate-800 border border-transparent',
                closedCard: 'border-emerald-500/35 bg-emerald-950/60 hover:border-emerald-400',
                closedTitle: 'text-slate-100',
                closedSub: 'text-emerald-300',
                closedChip: 'bg-slate-950/80 border-slate-700 text-slate-300',
                closedChipVal: 'text-slate-100',
                cnd3Card: 'bg-rose-950/70 border-rose-500/40 text-rose-300 hover:border-rose-400',
                cnd2Card: 'bg-amber-950/60 border-amber-500/40 text-amber-300 hover:border-amber-400',
                cndTitle: 'text-slate-100',
                shArrivedCard: 'bg-slate-900 border-slate-700/60 opacity-70 hover:opacity-100',
                shOpenCard: 'bg-amber-950/50 border-amber-500/45 hover:border-amber-400',
                shArrivedBadge: 'text-emerald-300 bg-emerald-950 border-emerald-500/40',
                shOpenBadge: 'text-rose-200 bg-rose-900 border-rose-400/50',
                chartHeader: 'bg-slate-900/90 border-slate-700/70',
                chartTitle: 'text-sky-300',
                chartSub: 'text-slate-400',
                chartTotalBox: 'text-slate-300 border-slate-700 bg-slate-950',
                chartTotalVal: 'text-sky-300',
                chartDivider: 'bg-slate-700/60',
                chartLegendBox: 'bg-slate-950/80 border-slate-700/70 hover:border-sky-400/60',
                legendSchedCard: 'text-sky-300 bg-sky-950/70 border-sky-500/40 hover:border-sky-400',
                legendSchedLabel: 'text-sky-300',
                legendSchedVal: 'text-sky-50',
                legendSchedSh: 'bg-amber-950 text-amber-300 border-amber-500/45',
                legendSchedPct: 'bg-slate-950 text-sky-300 border-sky-500/45',
                legendDelayCard: 'text-rose-300 bg-rose-950/70 border-rose-500/40 hover:border-rose-400',
                legendDelayLabel: 'text-rose-300',
                legendDelayVal: 'text-rose-50',
                legendDelaySh: 'bg-rose-900/80 text-amber-200 border-rose-400/45',
                legendDelayPct: 'bg-slate-950 text-rose-300 border-rose-500/45',
                legendMeta: 'text-slate-400',
                matrixPctCell: 'text-sky-300 bg-slate-950 border-slate-700',
                matrixDelayRemark: 'text-rose-200 bg-rose-950',
                matrixSchedRemark: 'text-sky-200 bg-sky-950',
                matrixPeriodCell: 'text-slate-300 bg-slate-900 border-slate-700',
                matrixWppCell: 'text-sky-300 bg-slate-800 border-slate-700',
                matrixOkLabel: 'text-sky-200 bg-sky-950 border-sky-700',
                matrixOkCell: 'text-slate-100 bg-slate-900/90',
                matrixOkTotal: 'bg-sky-900 text-sky-100',
                matrixShLabel: 'text-rose-200 bg-rose-950 border-rose-700',
                matrixShCell: 'text-rose-300 bg-rose-950/50',
                matrixShTotal: 'bg-rose-900 text-rose-100',
                matrixRiwLabel: 'text-amber-200 bg-amber-950 border-amber-700',
                matrixRiwCell: 'text-amber-300 bg-amber-950/40',
                matrixRiwTotal: 'bg-amber-900 text-amber-100',
                matrixFooterSched: 'text-emerald-300 bg-emerald-950/70',
                matrixFooterDelay: 'text-rose-300 bg-rose-950/70',
                matrixFooterPct: 'text-sky-300 bg-sky-950/70',
                matrixFooterPctVal: 'bg-sky-900 text-sky-100',
                matrixEmptyCell: 'bg-slate-950',
                recapWrap: 'bg-slate-950 border-slate-800',
                recapTh: 'bg-slate-800 text-sky-300 border-slate-700',
                recapRow: 'border-slate-800 hover:bg-slate-800/60',
                recapText: 'text-slate-100',
                recapMuted: 'text-slate-400'
            }
        },

        'emerald-nusantara': {
            id: 'emerald-nusantara',
            name: 'Nusantara Zamrud',
            shortName: 'Zamrud',
            subtitle: 'Hijau zamrud gelap & emas sampanye — adem untuk shift panjang',
            badge: 'Batik Dark',
            mode: 'dark',
            useBatikPatterns: true,
            showGunungan: true,
            swatches: ['#071612', '#112a21', '#e6c35c', '#10b981'],
            chart: {
                plotBgTop: 'rgba(14, 38, 30, 0.58)',
                plotBgBottom: 'rgba(7, 22, 18, 0.74)',
                plotWatermark: 'rgba(230, 195, 92, 0.06)',
                plotCorners: 'rgba(244, 216, 124, 0.38)',
                gridColor: 'rgba(230, 195, 92, 0.13)',
                borderColor: 'rgba(230, 195, 92, 0.28)',
                tickColor: '#b7d7c8',
                tooltipBg: 'rgba(7, 22, 18, 0.96)',
                tooltipBorder: '#e6c35c',
                tooltipTitle: '#f4d87c',
                tooltipBody: '#ecf7f1',
                delayZoneBg: 'rgba(153, 27, 27, 0.24)',
                delayZoneHatch: 'rgba(230, 195, 92, 0.13)',
                delayDivider: '#e6c35c',
                delayLabel: '#fda4af',
                donutCenterBg: '#091b15',
                donutRingOuter: 'rgba(244, 216, 124, 0.6)',
                donutRingInner: 'rgba(52, 211, 153, 0.35)',
                donutRays: 'rgba(244, 216, 124, 0.4)',
                donutPctColor: '#f4d87c',
                donutSubColor: '#9cc4b3',
                trendLine: '#34d399',
                trendAreaTop: 'rgba(52, 211, 153, 0.36)',
                trendAreaBottom: 'rgba(52, 211, 153, 0.02)',
                trendRegression: '#f4d87c',
                barTrend: '#f4d87c',
                pointBg: '#071612',
                pointBorder: '#6ee7b7',
                sliceBorder: '#091b15',
                sliceHoverBorder: '#f4d87c',
                datalabelText: '#f4fff9',
                datalabelBg: 'rgba(7, 22, 18, 0.72)',
                series: {
                    sched: { motif: 'kawung', base: '#127a57', stroke: '#f4d87c', accent: '#07241a', border: 'rgba(110,231,183,0.7)' },
                    shOnsched: { motif: 'nitik', base: '#b8831e', stroke: '#fef0b8', accent: '#fff8db', border: 'rgba(244,216,124,0.6)' },
                    delay: { motif: 'parang', base: '#962228', stroke: '#eab85c', accent: '#fae09e', border: 'rgba(244,216,124,0.5)' },
                    shDelay: { motif: 'ceplok', base: '#541218', stroke: '#d9a441', accent: '#f5d47a', border: 'rgba(217,164,65,0.55)' }
                },
                legendCaption: 'Batik Kawung (Zamrud) = On-Sched • Nitik (Emas) = Potensi SH • Parang (Marun) = Delay • Ceplok = Delay SH'
            },
            export: {
                bg: '#071612',
                border: '#dfb74c',
                title: '#f4d87c',
                subtitle: '#9cc4b3',
                thBg: '#15382c',
                thText: '#f4d87c',
                bodyText: '#ecf7f1',
                tableBg: '#0e241d',
                cellBorder: 'rgba(230,195,92,0.34)'
            },
            ui: {
                navInactive: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#b7d7c8] hover:text-[#f4d87c] border border-transparent whitespace-nowrap shrink-0',
                navInactivePaylater: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#b7d7c8] hover:text-[#dfb4ff] border border-transparent flex items-center gap-1 whitespace-nowrap shrink-0',
                navInactiveRocket: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#b7d7c8] hover:text-[#f9a8d4] border border-transparent flex items-center gap-1 whitespace-nowrap shrink-0',
                navActive: 'px-3 py-1.5 rounded-md text-xs font-extrabold transition text-[#071913] bg-gradient-to-r from-[#c79a2e] via-[#f2d478] to-[#c79a2e] border border-[#fff2bf]/70 shadow-md whitespace-nowrap shrink-0',
                navActivePaylater: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-[#3b1c54] text-[#dfb4ff] border border-[#c084fc]/60 flex items-center gap-1 whitespace-nowrap shrink-0',
                navActiveRocket: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-[#4e182e] text-[#f9a8d4] border border-[#f472b6]/60 flex items-center gap-1 whitespace-nowrap shrink-0',
                navMasterIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#f4d87c] bg-[#133127] hover:bg-[#1a4335] border border-[#e6c35c]/45 flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0',
                navInputIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#071913] bg-gradient-to-r from-[#c79a2e] via-[#f2d478] to-[#c79a2e] hover:brightness-110 border border-[#fff2bf]/60 flex items-center gap-1.5 shadow-md whitespace-nowrap shrink-0',
                navActionActive: 'px-3 py-1.5 rounded-md text-xs font-extrabold transition text-[#071913] bg-gradient-to-r from-[#c79a2e] via-[#f2d478] to-[#c79a2e] shadow-md border border-[#fff2bf]/70 flex items-center gap-1.5 whitespace-nowrap shrink-0',
                catActive: 'bg-gradient-to-r from-[#c79a2e] via-[#f2d478] to-[#c79a2e] text-[#071913] shadow border border-[#fff2bf]/70 font-extrabold',
                catInactive: 'text-[#b7d7c8] hover:text-[#f4d87c] hover:bg-[#133127] border border-transparent',
                closedCard: 'border-[#34d399]/35 bg-[#0e2d22] hover:border-[#34d399]/75',
                closedTitle: 'text-[#ecf7f1]',
                closedSub: 'text-[#6ee7b7]',
                closedChip: 'bg-[#071612]/80 border-[#e6c35c]/25 text-[#9cc4b3]',
                closedChipVal: 'text-[#ecf7f1]',
                cnd3Card: 'bg-[#281418] border-[#ef4444]/40 text-[#fda4af] hover:border-[#f87171]',
                cnd2Card: 'bg-[#262110] border-[#f59e0b]/40 text-[#fcd34d] hover:border-[#fbbf24]',
                cndTitle: 'text-[#ecf7f1]',
                shArrivedCard: 'bg-[#0b1f19] border-[#e6c35c]/20 opacity-70 hover:opacity-100',
                shOpenCard: 'bg-[#242110] border-[#f4d87c]/40 hover:border-[#f4d87c]',
                shArrivedBadge: 'text-[#6ee7b7] bg-[#0f4c36] border-[#34d399]/40',
                shOpenBadge: 'text-[#fecdd3] bg-[#7f1d1d] border-[#f87171]/50',
                chartHeader: 'bg-[#0d241c] border-[#e6c35c]/28',
                chartTitle: 'text-[#f4d87c]',
                chartSub: 'text-[#7da695]',
                chartTotalBox: 'text-[#9cc4b3] border-[#e6c35c]/40 bg-[#071612]',
                chartTotalVal: 'text-[#f4d87c]',
                chartDivider: 'bg-[#e6c35c]/22',
                chartLegendBox: 'bg-[#091a14] border-[#e6c35c]/30 hover:border-[#f4d87c]/65',
                legendSchedCard: 'text-[#6ee7b7] bg-[#0e2e23] border-[#34d399]/40 hover:border-[#6ee7b7]',
                legendSchedLabel: 'text-[#9cc4b3]',
                legendSchedVal: 'text-[#ecfdf5]',
                legendSchedSh: 'bg-[#3d300d] text-[#fde08d] border-[#e6c35c]/45',
                legendSchedPct: 'bg-[#071612] text-[#f4d87c] border-[#e6c35c]/45',
                legendDelayCard: 'text-[#fda4af] bg-[#281418] border-[#ef4444]/42 hover:border-[#f87171]',
                legendDelayLabel: 'text-[#e5a3a8]',
                legendDelayVal: 'text-[#ffe4e6]',
                legendDelaySh: 'bg-[#4c1518] text-[#fde08d] border-[#f87171]/45',
                legendDelayPct: 'bg-[#071612] text-[#fda4af] border-[#ef4444]/45',
                legendMeta: 'text-[#7da695]',
                matrixPctCell: 'text-[#f4d87c] bg-[#0a1c16] border-[#e6c35c]/35',
                matrixDelayRemark: 'text-[#fecdd3] bg-[#4a1618]',
                matrixSchedRemark: 'text-[#d1fae5] bg-[#10402f]',
                matrixPeriodCell: 'text-[#b7d7c8] bg-[#0d231b] border-[#e6c35c]/28',
                matrixWppCell: 'text-[#f4d87c] bg-[#123026] border-[#e6c35c]/28',
                matrixOkLabel: 'text-[#d1fae5] bg-[#123d2e] border-[#34d399]/40',
                matrixOkCell: 'text-[#ecf7f1] bg-[#0e2920]',
                matrixOkTotal: 'bg-[#16523d] text-[#ecfdf5]',
                matrixShLabel: 'text-[#fecdd3] bg-[#54171a] border-[#ef4444]/45',
                matrixShCell: 'text-[#fda4af] bg-[#331315]',
                matrixShTotal: 'bg-[#691c20] text-[#ffe4e6]',
                matrixRiwLabel: 'text-[#fde68a] bg-[#45340f] border-[#f59e0b]/45',
                matrixRiwCell: 'text-[#fcd34d] bg-[#2a210c]',
                matrixRiwTotal: 'bg-[#5c4514] text-[#fef3c7]',
                matrixFooterSched: 'text-[#6ee7b7] bg-[#0f3024]',
                matrixFooterDelay: 'text-[#fda4af] bg-[#361316]',
                matrixFooterPct: 'text-[#f4d87c] bg-[#15382c]',
                matrixFooterPctVal: 'bg-[#205442] text-[#fff3c4]',
                matrixEmptyCell: 'bg-[#0a1c16]',
                recapWrap: 'bg-[#091a14] border-[#e6c35c]/25',
                recapTh: 'bg-[#143429] text-[#f4d87c] border-[#e6c35c]/30',
                recapRow: 'border-[#e6c35c]/18 hover:bg-[#133127]',
                recapText: 'text-[#ecf7f1]',
                recapMuted: 'text-[#9cc4b3]'
            }
        },

        'macos-glass': {
            id: 'macos-glass',
            name: 'macOS Liquid Glass',
            shortName: 'macOS Glass',
            subtitle: 'Minimalis modern, kaca transparan buram ala macOS terbaru',
            badge: 'Glass',
            mode: 'light',
            useBatikPatterns: false,
            showGunungan: false,
            swatches: ['#eef3fb', '#ffffff', '#007aff', '#af52de'],
            chart: {
                plotBgTop: 'rgba(255, 255, 255, 0.55)',
                plotBgBottom: 'rgba(238, 243, 251, 0.35)',
                plotWatermark: null,
                plotCorners: null,
                gridColor: 'rgba(148, 163, 184, 0.22)',
                borderColor: 'rgba(148, 163, 184, 0.35)',
                tickColor: '#475569',
                tooltipBg: 'rgba(15, 23, 42, 0.88)',
                tooltipBorder: 'rgba(255, 255, 255, 0.35)',
                tooltipTitle: '#ffffff',
                tooltipBody: '#e2e8f0',
                delayZoneBg: 'rgba(255, 59, 48, 0.08)',
                delayZoneHatch: 'rgba(255, 59, 48, 0.10)',
                delayDivider: '#ff3b30',
                delayLabel: '#dc2626',
                donutCenterBg: 'rgba(255, 255, 255, 0.85)',
                donutRingOuter: 'rgba(0, 122, 255, 0.28)',
                donutRingInner: 'rgba(148, 163, 184, 0.20)',
                donutRays: null,
                donutPctColor: '#0f172a',
                donutSubColor: '#64748b',
                trendLine: '#007aff',
                trendAreaTop: 'rgba(0, 122, 255, 0.24)',
                trendAreaBottom: 'rgba(0, 122, 255, 0.01)',
                trendRegression: '#af52de',
                barTrend: '#1e293b',
                pointBg: '#ffffff',
                pointBorder: '#007aff',
                sliceBorder: 'rgba(255, 255, 255, 0.92)',
                sliceHoverBorder: '#007aff',
                datalabelText: '#ffffff',
                datalabelBg: 'rgba(15, 23, 42, 0.68)',
                series: {
                    sched: { fill: '#007aff', border: '#0062cc' },
                    shOnsched: { fill: '#ff9500', border: '#e08600' },
                    delay: { fill: '#ff3b30', border: '#d92d20' },
                    shDelay: { fill: '#b42318', border: '#912018' }
                },
                legendCaption: 'Biru = On-Sched • Oranye = Potensi SH • Merah = Delay • Marun = Delay SH'
            },
            export: {
                bg: '#eef3fb',
                border: '#cbd5e1',
                title: '#0f172a',
                subtitle: '#475569',
                thBg: '#e8effa',
                thText: '#334155',
                bodyText: '#0f172a',
                tableBg: '#ffffff',
                cellBorder: '#cbd5e1'
            },
            ui: {
                navInactive: 'px-3 py-1.5 rounded-full text-xs font-semibold transition text-slate-600 hover:text-[#007aff] hover:bg-white/80 border border-transparent whitespace-nowrap shrink-0',
                navInactivePaylater: 'px-3 py-1.5 rounded-full text-xs font-semibold transition text-slate-600 hover:text-purple-700 hover:bg-white/80 border border-transparent flex items-center gap-1 whitespace-nowrap shrink-0',
                navInactiveRocket: 'px-3 py-1.5 rounded-full text-xs font-semibold transition text-slate-600 hover:text-pink-700 hover:bg-white/80 border border-transparent flex items-center gap-1 whitespace-nowrap shrink-0',
                navActive: 'px-3 py-1.5 rounded-full text-xs font-bold transition bg-[#007aff] text-white shadow-sm border border-white/50 whitespace-nowrap shrink-0',
                navActivePaylater: 'px-3 py-1.5 rounded-full text-xs font-bold transition bg-[#af52de] text-white shadow-sm border border-white/50 flex items-center gap-1 whitespace-nowrap shrink-0',
                navActiveRocket: 'px-3 py-1.5 rounded-full text-xs font-bold transition bg-[#ff2d55] text-white shadow-sm border border-white/50 flex items-center gap-1 whitespace-nowrap shrink-0',
                navMasterIdle: 'px-3 py-1.5 rounded-full text-xs font-bold transition text-slate-700 bg-white/75 hover:bg-white border border-white/90 flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0',
                navInputIdle: 'px-3 py-1.5 rounded-full text-xs font-bold transition text-white bg-[#007aff] hover:bg-[#0066d6] border border-white/40 flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0',
                navActionActive: 'px-3 py-1.5 rounded-full text-xs font-extrabold transition text-white bg-[#005bb5] shadow-md border border-white/50 flex items-center gap-1.5 whitespace-nowrap shrink-0',
                catActive: 'bg-[#007aff] text-white shadow-sm border border-white/45 font-bold rounded-full',
                catInactive: 'text-slate-600 hover:text-[#007aff] hover:bg-white/80 border border-transparent rounded-full',
                closedCard: 'border-emerald-200/80 bg-white/65 hover:border-emerald-400 hover:bg-white/90',
                closedTitle: 'text-slate-900',
                closedSub: 'text-emerald-700',
                closedChip: 'bg-white/80 border-slate-200/80 text-slate-600',
                closedChipVal: 'text-slate-900',
                cnd3Card: 'bg-red-50/75 border-red-200/80 text-red-700 hover:border-red-400',
                cnd2Card: 'bg-amber-50/75 border-amber-200/80 text-amber-700 hover:border-amber-400',
                cndTitle: 'text-slate-900',
                shArrivedCard: 'bg-white/50 border-slate-200/70 opacity-75 hover:opacity-100',
                shOpenCard: 'bg-amber-50/75 border-amber-300/80 hover:border-amber-500',
                shArrivedBadge: 'text-emerald-700 bg-emerald-100/80 border-emerald-300',
                shOpenBadge: 'text-red-700 bg-red-100/80 border-red-300',
                chartHeader: 'bg-white/50 border-white/80',
                chartTitle: 'text-slate-900',
                chartSub: 'text-slate-500',
                chartTotalBox: 'text-slate-600 border-white/90 bg-white/70',
                chartTotalVal: 'text-[#007aff]',
                chartDivider: 'bg-slate-300/50',
                chartLegendBox: 'bg-white/50 border-white/80 hover:border-[#007aff]/40',
                legendSchedCard: 'text-[#007aff] bg-blue-50/70 border-blue-200/80 hover:border-[#007aff]',
                legendSchedLabel: 'text-[#007aff]',
                legendSchedVal: 'text-slate-950',
                legendSchedSh: 'bg-amber-100/85 text-amber-800 border-amber-300',
                legendSchedPct: 'bg-white/90 text-[#007aff] border-blue-200',
                legendDelayCard: 'text-red-700 bg-red-50/70 border-red-200/80 hover:border-red-400',
                legendDelayLabel: 'text-red-600',
                legendDelayVal: 'text-red-950',
                legendDelaySh: 'bg-red-100/85 text-red-800 border-red-300',
                legendDelayPct: 'bg-white/90 text-red-700 border-red-200',
                legendMeta: 'text-slate-500',
                matrixPctCell: 'text-[#0051a8] bg-white/75 border-slate-300/70',
                matrixDelayRemark: 'text-red-900 bg-red-100/80',
                matrixSchedRemark: 'text-blue-900 bg-blue-100/80',
                matrixPeriodCell: 'text-slate-600 bg-white/70 border-slate-200/80',
                matrixWppCell: 'text-slate-900 bg-slate-100/80 border-slate-200/80',
                matrixOkLabel: 'text-blue-900 bg-blue-50/80 border-blue-200',
                matrixOkCell: 'text-slate-800 bg-white/80',
                matrixOkTotal: 'bg-blue-100/85 text-blue-950',
                matrixShLabel: 'text-red-900 bg-red-50/80 border-red-200',
                matrixShCell: 'text-red-700 bg-red-50/40',
                matrixShTotal: 'bg-red-200/80 text-red-950',
                matrixRiwLabel: 'text-amber-900 bg-amber-50/80 border-amber-200',
                matrixRiwCell: 'text-amber-800 bg-amber-50/40',
                matrixRiwTotal: 'bg-amber-200/80 text-amber-950',
                matrixFooterSched: 'text-emerald-800 bg-emerald-50/80',
                matrixFooterDelay: 'text-red-800 bg-red-50/80',
                matrixFooterPct: 'text-[#0051a8] bg-blue-50/85',
                matrixFooterPctVal: 'bg-blue-100/90 text-[#004085]',
                matrixEmptyCell: 'bg-white/50',
                recapWrap: 'bg-white/70 border-white/85',
                recapTh: 'bg-slate-100/80 text-slate-700 border-slate-200/80',
                recapRow: 'border-slate-200/70 hover:bg-white/85',
                recapText: 'text-slate-900',
                recapMuted: 'text-slate-500'
            }
        },

        'windows-98': {
            id: 'windows-98',
            name: 'Windows 98 Classic',
            shortName: 'Win98',
            subtitle: 'Retro autentik 1998 — desktop teal, tombol 3D bevel, titlebar biru',
            badge: 'Retro',
            mode: 'light',
            useBatikPatterns: false,
            showGunungan: false,
            swatches: ['#008080', '#c0c0c0', '#000080', '#1084d0'],
            chart: {
                plotBgTop: '#ffffff',
                plotBgBottom: '#ffffff',
                plotWatermark: null,
                plotCorners: null,
                gridColor: '#c0c0c0',
                borderColor: '#808080',
                tickColor: '#000000',
                tooltipBg: '#ffffe1',
                tooltipBorder: '#000000',
                tooltipTitle: '#000080',
                tooltipBody: '#000000',
                delayZoneBg: 'rgba(128, 0, 0, 0.10)',
                delayZoneHatch: 'rgba(128, 0, 0, 0.14)',
                delayDivider: '#800000',
                delayLabel: '#800000',
                donutCenterBg: '#ffffff',
                donutRingOuter: '#808080',
                donutRingInner: '#c0c0c0',
                donutRays: null,
                donutPctColor: '#000080',
                donutSubColor: '#404040',
                trendLine: '#000080',
                trendAreaTop: 'rgba(0, 0, 128, 0.22)',
                trendAreaBottom: 'rgba(0, 0, 128, 0.02)',
                trendRegression: '#800000',
                barTrend: '#000000',
                pointBg: '#ffffff',
                pointBorder: '#000080',
                sliceBorder: '#000000',
                sliceHoverBorder: '#000080',
                datalabelText: '#ffffff',
                datalabelBg: '#000080',
                series: {
                    sched: { fill: '#000080', border: '#000000' },
                    shOnsched: { fill: '#808000', border: '#000000' },
                    delay: { fill: '#c00000', border: '#000000' },
                    shDelay: { fill: '#800000', border: '#000000' }
                },
                legendCaption: 'Navy = On-Sched • Olive = Potensi SH • Merah = Delay • Marun = Delay SH'
            },
            export: {
                bg: '#c0c0c0',
                border: '#000000',
                title: '#000080',
                subtitle: '#000000',
                thBg: '#c0c0c0',
                thText: '#000000',
                bodyText: '#000000',
                tableBg: '#ffffff',
                cellBorder: '#808080'
            },
            ui: {
                navInactive: 'px-3 py-1.5 text-xs font-bold transition text-black bg-[#c0c0c0] hover:bg-[#d4d0c8] border border-black shadow-[inset_1.5px_1.5px_0_#fff,inset_-1.5px_-1.5px_0_#808080] whitespace-nowrap shrink-0',
                navInactivePaylater: 'px-3 py-1.5 text-xs font-bold transition text-black bg-[#c0c0c0] hover:bg-[#d4d0c8] border border-black shadow-[inset_1.5px_1.5px_0_#fff,inset_-1.5px_-1.5px_0_#808080] flex items-center gap-1 whitespace-nowrap shrink-0',
                navInactiveRocket: 'px-3 py-1.5 text-xs font-bold transition text-black bg-[#c0c0c0] hover:bg-[#d4d0c8] border border-black shadow-[inset_1.5px_1.5px_0_#fff,inset_-1.5px_-1.5px_0_#808080] flex items-center gap-1 whitespace-nowrap shrink-0',
                navActive: 'px-3 py-1.5 text-xs font-bold transition bg-[#000080] text-white border border-black shadow-[inset_1.5px_1.5px_0_#808080,inset_-1.5px_-1.5px_0_#fff] whitespace-nowrap shrink-0',
                navActivePaylater: 'px-3 py-1.5 text-xs font-bold transition bg-[#800080] text-white border border-black shadow-[inset_1.5px_1.5px_0_#808080,inset_-1.5px_-1.5px_0_#fff] flex items-center gap-1 whitespace-nowrap shrink-0',
                navActiveRocket: 'px-3 py-1.5 text-xs font-bold transition bg-[#800000] text-white border border-black shadow-[inset_1.5px_1.5px_0_#808080,inset_-1.5px_-1.5px_0_#fff] flex items-center gap-1 whitespace-nowrap shrink-0',
                navMasterIdle: 'px-3 py-1.5 text-xs font-bold transition text-black bg-[#c0c0c0] hover:bg-[#d4d0c8] border border-black shadow-[inset_1.5px_1.5px_0_#fff,inset_-1.5px_-1.5px_0_#808080] flex items-center gap-1.5 whitespace-nowrap shrink-0',
                navInputIdle: 'px-3 py-1.5 text-xs font-bold transition text-black bg-[#c0c0c0] hover:bg-[#d4d0c8] border border-black shadow-[inset_1.5px_1.5px_0_#fff,inset_-1.5px_-1.5px_0_#808080] flex items-center gap-1.5 whitespace-nowrap shrink-0',
                navActionActive: 'px-3 py-1.5 text-xs font-bold transition text-white bg-[#000080] border border-black shadow-[inset_1.5px_1.5px_0_#808080,inset_-1.5px_-1.5px_0_#fff] flex items-center gap-1.5 whitespace-nowrap shrink-0',
                catActive: 'bg-[#000080] text-white border border-black font-bold',
                catInactive: 'text-black bg-[#c0c0c0] hover:bg-[#d4d0c8] border border-[#808080]',
                closedCard: 'border-[#808080] bg-white hover:bg-[#f0fff0]',
                closedTitle: 'text-black',
                closedSub: 'text-[#006600]',
                closedChip: 'bg-[#dfdfdf] border-[#808080] text-black',
                closedChipVal: 'text-black',
                cnd3Card: 'bg-[#fff0f0] border-[#800000] text-[#800000]',
                cnd2Card: 'bg-[#ffffe1] border-[#808000] text-[#804000]',
                cndTitle: 'text-black',
                shArrivedCard: 'bg-[#dfdfdf] border-[#808080] opacity-80 hover:opacity-100',
                shOpenCard: 'bg-[#ffffe1] border-[#808000]',
                shArrivedBadge: 'text-white bg-[#008000] border-black',
                shOpenBadge: 'text-white bg-[#800000] border-black',
                chartHeader: 'bg-gradient-to-r from-[#000080] to-[#1084d0] border-black',
                chartTitle: 'text-white',
                chartSub: 'text-[#e2e8f0]',
                chartTotalBox: 'text-black border-black bg-[#c0c0c0]',
                chartTotalVal: 'text-[#000080]',
                chartDivider: 'bg-[#808080]',
                chartLegendBox: 'bg-white border-[#808080]',
                legendSchedCard: 'text-[#000080] bg-[#e8eef7] border-[#000080]',
                legendSchedLabel: 'text-[#000080]',
                legendSchedVal: 'text-black',
                legendSchedSh: 'bg-[#ffffe1] text-[#804000] border-[#808000]',
                legendSchedPct: 'bg-white text-[#000080] border-[#808080]',
                legendDelayCard: 'text-[#800000] bg-[#fff0f0] border-[#800000]',
                legendDelayLabel: 'text-[#800000]',
                legendDelayVal: 'text-black',
                legendDelaySh: 'bg-[#ffdada] text-[#800000] border-[#800000]',
                legendDelayPct: 'bg-white text-[#800000] border-[#808080]',
                legendMeta: 'text-black',
                matrixPctCell: 'text-[#000080] bg-[#dfdfdf] border-[#808080]',
                matrixDelayRemark: 'text-white bg-[#800000]',
                matrixSchedRemark: 'text-white bg-[#000080]',
                matrixPeriodCell: 'text-black bg-[#dfdfdf] border-[#808080]',
                matrixWppCell: 'text-[#000080] bg-[#c0c0c0] border-[#808080]',
                matrixOkLabel: 'text-[#000080] bg-[#d9e6f6] border-[#808080]',
                matrixOkCell: 'text-black bg-white',
                matrixOkTotal: 'bg-[#c0d6f0] text-black',
                matrixShLabel: 'text-[#800000] bg-[#f6d9d9] border-[#808080]',
                matrixShCell: 'text-[#800000] bg-[#fff5f5]',
                matrixShTotal: 'bg-[#f0bcbc] text-black',
                matrixRiwLabel: 'text-[#804000] bg-[#ffffe1] border-[#808080]',
                matrixRiwCell: 'text-[#804000] bg-[#fffff2]',
                matrixRiwTotal: 'bg-[#f0e6a8] text-black',
                matrixFooterSched: 'text-[#006600] bg-[#e2f5e2]',
                matrixFooterDelay: 'text-[#800000] bg-[#fbe4e4]',
                matrixFooterPct: 'text-[#000080] bg-[#d9e6f6]',
                matrixFooterPctVal: 'bg-[#000080] text-white',
                matrixEmptyCell: 'bg-[#efefef]',
                recapWrap: 'bg-white border-[#808080]',
                recapTh: 'bg-[#c0c0c0] text-black border-[#808080]',
                recapRow: 'border-[#c0c0c0] hover:bg-[#e8eef7]',
                recapText: 'text-black',
                recapMuted: 'text-[#404040]'
            }
        },

        'imperial-japan': {
            id: 'imperial-japan',
            name: 'Imperial Kyoto',
            shortName: 'Kyoto',
            subtitle: 'Royal Jepang — merah marun lacquer, emas & krim washi beraksen Kumo/Uzumaki',
            badge: 'Royal JP',
            mode: 'light',
            useBatikPatterns: false,
            showGunungan: false,
            swatches: ['#6b101d', '#d4a644', '#faf3e4', '#8a1c26'],
            chart: {
                plotBgTop: 'rgba(255, 252, 244, 0.92)',
                plotBgBottom: 'rgba(247, 236, 214, 0.78)',
                plotWatermark: 'rgba(197, 147, 46, 0.14)',
                plotWatermarkStyle: 'uzumaki',
                plotCorners: 'rgba(197, 147, 46, 0.65)',
                gridColor: 'rgba(138, 28, 38, 0.10)',
                borderColor: 'rgba(197, 147, 46, 0.52)',
                tickColor: '#5c232b',
                tooltipBg: 'rgba(67, 7, 16, 0.96)',
                tooltipBorder: '#d4a644',
                tooltipTitle: '#fae19c',
                tooltipBody: '#fff8e7',
                delayZoneBg: 'rgba(138, 28, 38, 0.11)',
                delayZoneHatch: 'rgba(197, 147, 46, 0.18)',
                delayDivider: '#8a1c26',
                delayLabel: '#7a1220',
                donutCenterBg: '#fffdf7',
                donutRingOuter: 'rgba(197, 147, 46, 0.78)',
                donutRingInner: 'rgba(138, 28, 38, 0.35)',
                donutRays: 'rgba(197, 147, 46, 0.45)',
                donutPctColor: '#6b101d',
                donutSubColor: '#8a5a4e',
                trendLine: '#8a1c26',
                trendAreaTop: 'rgba(197, 147, 46, 0.30)',
                trendAreaBottom: 'rgba(250, 243, 228, 0.02)',
                trendRegression: '#c5932e',
                barTrend: '#540914',
                pointBg: '#fffdf7',
                pointBorder: '#8a1c26',
                sliceBorder: '#fffdf7',
                sliceHoverBorder: '#d4a644',
                datalabelText: '#fff8e7',
                datalabelBg: 'rgba(99, 12, 24, 0.88)',
                series: {
                    sched: { fill: '#c5932e', border: '#9c7019' },
                    shOnsched: { fill: '#d97706', border: '#a85704' },
                    delay: { fill: '#8a1c26', border: '#5c0b17' },
                    shDelay: { fill: '#4e0812', border: '#2e040a' }
                },
                legendCaption: 'Emas = On-Sched • Amber = Potensi SH • Marun = Delay • Lacquer Gelap = Delay SH'
            },
            export: {
                bg: '#faf3e4',
                border: '#c5932e',
                title: '#6b101d',
                subtitle: '#7e5247',
                thBg: '#6b101d',
                thText: '#fae19c',
                bodyText: '#2d0c11',
                tableBg: '#fffdf7',
                cellBorder: '#e2cca3'
            },
            ui: {
                navInactive: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#f5e3be] hover:text-[#fffdf7] hover:bg-[#8a1c26]/45 whitespace-nowrap shrink-0',
                navInactivePaylater: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#f8d7de] hover:text-[#fffdf7] hover:bg-[#8a1c26]/45 flex items-center gap-1 whitespace-nowrap shrink-0',
                navInactiveRocket: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#fae19c] hover:text-[#fffdf7] hover:bg-[#8a1c26]/45 flex items-center gap-1 whitespace-nowrap shrink-0',
                navActive: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-gradient-to-b from-[#e0b85c] to-[#b98521] text-[#3a050c] shadow-md border border-[#fff0bd]/70 whitespace-nowrap shrink-0',
                navActivePaylater: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-gradient-to-b from-[#9c1d37] to-[#680f23] text-[#fff8e7] shadow-md border border-[#e0b85c]/80 flex items-center gap-1 whitespace-nowrap shrink-0',
                navActiveRocket: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-gradient-to-b from-[#b4232c] to-[#74101a] text-[#fae19c] shadow-md border border-[#f5d882]/80 flex items-center gap-1 whitespace-nowrap shrink-0',
                navMasterIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#fae19c] bg-[#440710]/85 hover:bg-[#6b101d] border border-[#d4a644]/55 flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0',
                navInputIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#3a050c] bg-gradient-to-r from-[#e5be63] to-[#c9962f] hover:from-[#f2d07b] hover:to-[#d9a63c] border border-[#fff0bd]/70 flex items-center gap-1.5 shadow-md whitespace-nowrap shrink-0',
                navActionActive: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#fff8e7] bg-[#8a1c26] border border-[#f5d882] flex items-center gap-1.5 shadow-md whitespace-nowrap shrink-0',
                catActive: 'bg-gradient-to-r from-[#8a1c26] to-[#630c18] text-[#fff8e7] border border-[#d4a644] shadow-sm font-bold',
                catInactive: 'text-[#6b101d] hover:text-[#3d0b12] hover:bg-[#fffdf7] border border-transparent',
                closedCard: 'border-[#246346]/25 bg-[#f7faf7] hover:bg-[#ecf5ee]',
                closedTitle: 'text-[#1b4733]',
                closedSub: 'text-[#2d6a4f]',
                closedChip: 'bg-[#fffdf7] border-[#c5932e]/35 text-[#5c232b]',
                closedChipVal: 'text-[#2d0c11]',
                cnd3Card: 'bg-[#fdf1f0] border-[#8a1c26]/35 text-[#7a1220]',
                cnd2Card: 'bg-[#fcf5e4] border-[#c5932e]/45 text-[#8c5a0d]',
                cndTitle: 'text-[#3d0b12]',
                shArrivedCard: 'bg-[#f6efe1] border-[#c5932e]/35 opacity-80 hover:opacity-100',
                shOpenCard: 'bg-[#fcf3df] border-[#c5932e]/60',
                shArrivedBadge: 'text-[#1e573b] bg-[#e6f3ec] border-[#246346]/35',
                shOpenBadge: 'text-[#fff8e7] bg-[#8a1c26] border-[#d4a644]',
                chartHeader: 'bg-gradient-to-r from-[#630c18] via-[#7c1423] to-[#520813] border-[#d4a644]/60',
                chartTitle: 'text-[#fae19c]',
                chartSub: 'text-[#f0d8a8]',
                chartTotalBox: 'text-[#fae19c] border-[#d4a644]/55 bg-[#3d060e]/70',
                chartTotalVal: 'text-[#fffaf0]',
                chartDivider: 'bg-[#c5932e]/30',
                chartLegendBox: 'bg-[#faf3e4]/85 border-[#c5932e]/42',
                legendSchedCard: 'text-[#75500d] bg-[#fbf3df] border-[#c5932e]/55',
                legendSchedLabel: 'text-[#8c6314]',
                legendSchedVal: 'text-[#3d0b12]',
                legendSchedSh: 'bg-[#f7e5be] text-[#854d0e] border-[#c5932e]/50',
                legendSchedPct: 'bg-[#fffdf7] text-[#7a520e] border-[#c5932e]/50',
                legendDelayCard: 'text-[#7a1220] bg-[#fbeae8] border-[#8a1c26]/38',
                legendDelayLabel: 'text-[#8a1c26]',
                legendDelayVal: 'text-[#4a0811]',
                legendDelaySh: 'bg-[#f5d4d2] text-[#6b101d] border-[#8a1c26]/40',
                legendDelayPct: 'bg-[#fffdf7] text-[#7a1220] border-[#8a1c26]/40',
                legendMeta: 'text-[#5c232b]',
                matrixPctCell: 'text-[#6b101d] bg-[#f7ebd3] border-[#c5932e]/45',
                matrixDelayRemark: 'text-[#fff8e7] bg-[#8a1c26]',
                matrixSchedRemark: 'text-[#3a050c] bg-[#e0b85c]',
                matrixPeriodCell: 'text-[#3d0b12] bg-[#f5e7ca] border-[#c5932e]/45',
                matrixWppCell: 'text-[#6b101d] bg-[#faefd9] border-[#c5932e]/45',
                matrixOkLabel: 'text-[#7a520e] bg-[#fbf1d9] border-[#c5932e]/45',
                matrixOkCell: 'text-[#2d0c11] bg-[#fffdf7]',
                matrixOkTotal: 'bg-[#f3e1b8] text-[#4a0811]',
                matrixShLabel: 'text-[#8a1c26] bg-[#f9e5e3] border-[#8a1c26]/30',
                matrixShCell: 'text-[#7a1220] bg-[#fff8f7]',
                matrixShTotal: 'bg-[#f3d1cf] text-[#5c0b17]',
                matrixRiwLabel: 'text-[#92400e] bg-[#fcf0d6] border-[#c5932e]/45',
                matrixRiwCell: 'text-[#7c370b] bg-[#fffbf2]',
                matrixRiwTotal: 'bg-[#f4dfb1] text-[#542407]',
                matrixFooterSched: 'text-[#1e573b] bg-[#ebf4ee]',
                matrixFooterDelay: 'text-[#7a1220] bg-[#f9e6e4]',
                matrixFooterPct: 'text-[#6b101d] bg-[#f7ebd3]',
                matrixFooterPctVal: 'bg-[#6b101d] text-[#fae19c]',
                matrixEmptyCell: 'bg-[#f6ecda]',
                recapWrap: 'bg-[#fffdf7] border-[#c5932e]/45',
                recapTh: 'bg-[#6b101d] text-[#fae19c] border-[#d4a644]/40',
                recapRow: 'border-[#c5932e]/25 hover:bg-[#f9efd9]',
                recapText: 'text-[#2d0c11]',
                recapMuted: 'text-[#7e5247]'
            }
        }
    };

    window.EWIP_THEMES = EWIP_THEMES;

    let themeTransitionTimer = null;
    let popoverCloseTimer = null;

    function getActiveThemeId() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved && EWIP_THEMES[saved]) return saved;
        } catch (e) {}
        return DEFAULT_THEME_ID;
    }

    function getThemeConfig(id) {
        const key = id && EWIP_THEMES[id] ? id : getActiveThemeId();
        return EWIP_THEMES[key] || EWIP_THEMES[DEFAULT_THEME_ID];
    }

    function renderThemePickerMenu() {
        const listEl = document.getElementById('theme-picker-list');
        if (!listEl) return;
        const activeId = getActiveThemeId();

        listEl.innerHTML = Object.values(EWIP_THEMES).map(t => {
            const isActive = t.id === activeId;
            return `
                <button type="button" onclick="window.applyTheme('${t.id}', { closeMenu: true, toast: true, animate: true, event: event })"
                    class="theme-option-card ${isActive ? 'is-active' : ''}">
                    <div class="theme-swatch-stack" aria-hidden="true">
                        <span style="background:${t.swatches[0]}"></span>
                        <span style="background:${t.swatches[1]}"></span>
                        <span style="background:${t.swatches[2]}"></span>
                        <span style="background:${t.swatches[3]}"></span>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between gap-2">
                            <span class="font-bold text-xs truncate">${t.name}</span>
                            <span class="theme-mode-tag shrink-0">${t.badge}</span>
                        </div>
                        <p class="text-[10px] opacity-75 truncate mt-0.5">${t.subtitle}</p>
                    </div>
                    ${isActive ? '<span class="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style="background:var(--accent-main);color:var(--accent-on);"><i data-lucide="check" class="w-3 h-3"></i></span>' : ''}
                </button>
            `;
        }).join('');

        if (window.lucide) window.lucide.createIcons();
    }

    function updateThemeTriggerBadge(theme) {
        const btn = document.getElementById('btn-theme-switcher');
        if (btn) {
            btn.setAttribute('title', `Ganti Tema (Aktif: ${theme.name})`);
            btn.setAttribute('aria-label', `Ganti Tema (Aktif: ${theme.name})`);
        }

        // Toggle traditional Gunungan SVG crests for Batik themes
        document.querySelectorAll('.ewip-batik-crest').forEach(el => {
            el.classList.toggle('hidden', !theme.showGunungan);
        });
    }

    function closeThemePopoverSmooth() {
        const pop = document.getElementById('theme-picker-popover');
        if (!pop || pop.classList.contains('hidden')) return;
        pop.classList.remove('is-open');
        if (popoverCloseTimer) clearTimeout(popoverCloseTimer);
        popoverCloseTimer = setTimeout(() => {
            pop.classList.add('hidden');
        }, 180);
    }

    function openThemePopoverSmooth() {
        const pop = document.getElementById('theme-picker-popover');
        if (!pop) return;
        if (popoverCloseTimer) clearTimeout(popoverCloseTimer);
        renderThemePickerMenu();
        pop.classList.remove('hidden');
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                pop.classList.add('is-open');
            });
        });
    }

    function getTransitionOrigin(options) {
        const ev = options && options.event;
        if (ev && typeof ev.clientX === 'number' && typeof ev.clientY === 'number' && (ev.clientX > 0 || ev.clientY > 0)) {
            return { x: ev.clientX, y: ev.clientY };
        }
        const btn = document.getElementById('btn-theme-switcher');
        if (btn) {
            const rect = btn.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
        return { x: window.innerWidth - 36, y: 28 };
    }

    function applyTheme(themeId, options = {}) {
        const theme = EWIP_THEMES[themeId] ? EWIP_THEMES[themeId] : EWIP_THEMES[DEFAULT_THEME_ID];
        const prevThemeId = document.body ? document.body.getAttribute('data-theme') : null;
        const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const shouldAnimate = options.animate === true && !prefersReduced && prevThemeId && prevThemeId !== theme.id;

        const commitThemeDOM = () => {
            document.body.setAttribute('data-theme', theme.id);
            document.body.setAttribute('data-theme-mode', theme.mode);

            try {
                localStorage.setItem(STORAGE_KEY, theme.id);
            } catch (e) {}

            updateThemeTriggerBadge(theme);
            renderThemePickerMenu();

            if (options.closeMenu) {
                const pop = document.getElementById('theme-picker-popover');
                if (pop) {
                    pop.classList.remove('is-open');
                    pop.classList.add('hidden');
                }
            }

            // Re-sync live navigation classes, charts, and report tables if app.js is already loaded
            if (typeof window.syncAppAfterThemeChange === 'function') {
                window.__ewipThemeSwitching = true;
                try {
                    window.syncAppAfterThemeChange(theme);
                } finally {
                    window.__ewipThemeSwitching = false;
                }
            }
        };

        const showThemeToast = () => {
            if (options.toast && typeof window.showToast === 'function') {
                window.showToast(`Tema diganti ke: ${theme.name}`, 'info');
            }
        };

        if (shouldAnimate && typeof document.startViewTransition === 'function') {
            const origin = getTransitionOrigin(options);
            const endRadius = Math.hypot(
                Math.max(origin.x, window.innerWidth - origin.x),
                Math.max(origin.y, window.innerHeight - origin.y)
            );
            document.documentElement.classList.add('ewip-vt-radial');
            try {
                const transition = document.startViewTransition(() => {
                    commitThemeDOM();
                });
                transition.ready.then(() => {
                    document.documentElement.animate(
                        {
                            clipPath: [
                                `circle(0px at ${origin.x}px ${origin.y}px)`,
                                `circle(${endRadius}px at ${origin.x}px ${origin.y}px)`
                            ]
                        },
                        {
                            duration: 500,
                            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                            pseudoElement: '::view-transition-new(root)'
                        }
                    );
                }).catch(() => {});
                transition.finished.finally(() => {
                    document.documentElement.classList.remove('ewip-vt-radial');
                    showThemeToast();
                });
                return;
            } catch (e) {
                document.documentElement.classList.remove('ewip-vt-radial');
            }
        }

        // Coordinated CSS transition fallback (smooth across Safari/Firefox/older browsers)
        if (shouldAnimate) {
            document.documentElement.classList.add('ewip-theme-transitioning');
            if (themeTransitionTimer) clearTimeout(themeTransitionTimer);
            commitThemeDOM();
            themeTransitionTimer = setTimeout(() => {
                document.documentElement.classList.remove('ewip-theme-transitioning');
                themeTransitionTimer = null;
            }, 460);
            showThemeToast();
        } else {
            commitThemeDOM();
            showThemeToast();
        }
    }

    function toggleThemePopover(e) {
        if (e) e.stopPropagation();
        const pop = document.getElementById('theme-picker-popover');
        if (!pop) return;
        const willOpen = pop.classList.contains('hidden');
        if (willOpen) {
            openThemePopoverSmooth();
        } else {
            closeThemePopoverSmooth();
        }
    }

    document.addEventListener('click', (e) => {
        const pop = document.getElementById('theme-picker-popover');
        const btn = document.getElementById('btn-theme-switcher');
        if (!pop || pop.classList.contains('hidden')) return;
        if (!pop.contains(e.target) && (!btn || !btn.contains(e.target))) {
            closeThemePopoverSmooth();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeThemePopoverSmooth();
        }
    });

    window.getActiveThemeId = getActiveThemeId;
    window.getThemeConfig = getThemeConfig;
    window.applyTheme = applyTheme;
    window.toggleThemePopover = toggleThemePopover;

    // Apply saved theme immediately on script execution (instant, no startup animation)
    if (document.body) {
        applyTheme(getActiveThemeId(), { closeMenu: false, toast: false, animate: false });
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            applyTheme(getActiveThemeId(), { closeMenu: false, toast: false, animate: false });
        });
    }
})();
