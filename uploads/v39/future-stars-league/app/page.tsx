"use client";

import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Download,
  Edit3,
  Eye,
  FileCheck2,
  Flag,
  LayoutDashboard,
  ListPlus,
  LockKeyhole,
  Mail,
  MapPin,
  Medal,
  Menu,
  Mic2,
  Newspaper,
  Plus,
  Radio,
  Save,
  Search,
  Share2,
  Settings,
  ShieldCheck,
  Shirt,
  Sparkles,
  Star,
  Trash2,
  Trophy,
  UploadCloud,
  UserRound,
  UsersRound,
  WandSparkles,
  Video,
  Zap,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";

declare global {
  interface Document {
    modelContext?: {
      registerTool: (
        tool: Record<string, unknown>,
        options?: { signal?: AbortSignal },
      ) => void | Promise<void>;
    };
  }
}

type Screen =
  "hub" | "tournament" | "public" | "control" | "club" | "referee" | "create";
type Tournament = {
  id: string;
  name: string;
  edition: string;
  teamCount: number;
  fieldCount: number;
  status: "draft" | "active" | "completed" | "archived";
  progress: number;
  accent: string;
  matchCount?: number;
  playedCount?: number;
  upcomingCount?: number;
};
type CurrentUser = { id: string; name: string; email: string; role: string };
type TeamEntry = {
  entryId?: string;
  id: string;
  name: string;
  shortName: string;
  city: string;
  primaryColor: string;
  category?: string;
  division?: string;
  status?: string;
  clubId?: string;
  clubName?: string;
  squadName?: string;
  birthYear?: number | null;
  coachName?: string;
  rosterCount?: number;
};
type MatchDetail = {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  tournamentName?: string;
  tournamentEdition?: string;
  home: string;
  homeShort: string;
  away: string;
  awayShort: string;
  category: string;
  division: string;
  matchDay: number;
  startsAt: string;
  venue: string;
  field: string;
  refereeName: string;
  status: string;
  homeScore?: number | null;
  awayScore?: number | null;
  callups: { home: string[]; away: string[] };
  competitionId?: string;
  competitionName?: string;
  stage?: string;
  roundName?: string;
  bracketRound?: number | null;
  bracketTieId?: string | null;
  bracketLeg?: number;
  homePenaltyScore?: number | null;
  awayPenaltyScore?: number | null;
};
type CompetitionSetting = {
  id?: string;
  clientKey?: string;
  category: string;
  division: string;
  maxTeams: number;
  format: string;
  finals: string;
  enabled: boolean | number;
  name: string;
  kind: "league" | "knockout" | "league_knockout";
  finalsConfig: {mode:string;qualifiers:number;semifinalLegs:number;finalLegs:number;thirdPlace:boolean;playoutEnabled:boolean;playoutTeams:number;promotions:number;relegations:number;promotionTargetDivision:string;relegationTargetDivision:string};
  participantIds?: string[];
};
type TournamentField = {id?:string;venueName:string;address?:string;fieldName:string;fieldNumber?:string;active:boolean|number;sortOrder?:number};
type ScheduleConfig = {startDate:string;endDate:string;startTime:string;endTime:string;matchMinutes:number;bufferMinutes:number;matchFeeCents:number;activeDays:number[]|string};
type Player = {
  id: string;
  firstName: string;
  lastName: string;
  birthYear: number;
  shirtNumber: number | null;
  role: string;
  status: string;
  photoKey?: string;
  publicName?: string;
  bio?: string;
  preferredFoot?: string;
  profileVisibility?: string;
  mediaConsent?: boolean | number;
};
type TeamProfile = TeamEntry & {
  displayName?: string;
  address: string;
  phone: string;
  email: string;
  contactName: string;
  website: string;
  description: string;
  clubManagerUserId?: string;
  secondaryColor: string;
  crestKey?: string;
  coverKey?: string;
  rosterImageKey?: string;
  sponsorLogoKey?: string;
};
type ClubSquad = {id:string;displayName:string;squadName:string;birthYear?:number|null;coachName?:string;rosterCount:number;tournamentCount:number};
type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  teamName?: string;
};
type RefereeOption = { name: string; email: string };
type Standing = {
  competitionId?: string;
  competitionName?: string;
  category: string;
  division: string;
  id: string;
  name: string;
  shortName: string;
  played: number;
  gf: number;
  ga: number;
  points: number;
};
type ErrorReport = {id:string;subject:string;description:string;status:string;resolution?:string;createdAt:string;matchName?:string};
type EditorialPost = {id:string;teamId?:string;matchId?:string;type:string;title:string;excerpt?:string;body?:string;mediaKey?:string;videoUrl?:string;status:string;publishedAt?:string;createdAt:string;teamName?:string;matchName?:string};
type AwardEntry = {id:string;matchId?:string;teamId?:string;playerId?:string;scope:string;type:string;title:string;recipientName:string;note?:string;mediaKey?:string;status:string;awardedAt:string;teamName?:string;playerName?:string;matchName?:string};
type AwardNomination = {id:string;scope:string;awardType:string;nomineeName:string;motivation:string;evidence?:string;status:string;createdAt:string;teamName?:string;matchName?:string};
type AwardCandidate = {id:string;teamId:string;firstName:string;lastName:string;shirtNumber?:number|null;role:string;photoKey?:string;teamName:string;teamShort:string};
type PlayerStat = {id:string;playerId:string;tournamentId:string;tournamentName:string;edition:string;appearances:number;goals:number;assists:number;cleanSheets:number;mvpAwards:number;yellowCards:number;redCards:number;minutesPlayed:number};
type PlayerMilestone = {id:string;playerId:string;tournamentId?:string;type:string;title:string;description?:string;happenedAt:string};
type PlayerAward = {id:string;playerId:string;type:string;title:string;note?:string;awardedAt:string};
type TeamTournament = {id:string;name:string;edition:string};
type PaymentSummary = {teamId:string;teamName:string;shortName:string;primaryColor:string;callups:number;dueCents:number;paidCents:number;balanceCents:number};
type PaymentMatchRow = {matchId:string;teamId:string;teamName:string;opponent:string;startsAt:string;matchDay:number;category:string;division:string;callups:number;dueCents:number;paidCents:number};
type PaymentEntry = {id:string;teamId:string;teamName:string;matchId?:string;matchName?:string;amountCents:number;method:string;reference?:string;notes?:string;paidAt:string;createdAt:string;createdByName:string};
type MatchEvent = {id:string;teamId:string;playerId:string;assistPlayerId?:string|null;type:"goal"|"own_goal"|"yellow_card"|"red_card"|"mvp";minute:number;note?:string;playerName?:string;assistPlayerName?:string};
type MatchPlayerRating = {playerId:string;teamId:string;baseRatingTenths:number;manualDeltaTenths:number;modifiers:string[];finalRatingTenths:number};
type FantasyRating = {playerId:string;matchId:string;teamId:string;finalRatingTenths:number;modifiers:string[];matchDay:number;startsAt:string;competitionId:string;category:string;playerName:string;photoKey?:string;role:string;shirtNumber?:number|null;teamName:string;teamShort:string;teamColor:string;crestKey?:string;appearances:number;goals:number;assists:number;cleanSheets:number;mvpAwards:number};
type SeasonOutcome = {id:string;competitionId:string;teamId:string;outcome:string;position?:number;source:string;note?:string;decidedAt:string;teamName:string;shortName:string;competitionName:string;category:string;division:string};
type TournamentTab = "overview" | "teams" | "structure" | "matches" | "standings" | "season" | "payments" | "content" | "awards" | "users" | "errors";
type TournamentWorkspace = {
  tournament: {
    id: string;
    name: string;
    edition: string;
    status: string;
    plannedTeams: number;
    fieldCount: number;
    isPublic?: boolean | number;
    publishedAt?: string;
    closedAt?: string;
  };
  teams: TeamEntry[];
  directory: TeamEntry[];
  matches: MatchDetail[];
  settings: CompetitionSetting[];
  fields: TournamentField[];
  scheduleConfig: ScheduleConfig;
  invitations: Invitation[];
  referees: RefereeOption[];
  standings: Standing[];
  viewerRole: string;
  errorReports: ErrorReport[];
  editorialPosts: EditorialPost[];
  awards: AwardEntry[];
  nominations: AwardNomination[];
  awardCandidates: AwardCandidate[];
  seasonOutcomes: SeasonOutcome[];
  viewerName?: string;
  managedTeamIds?: string[];
  demoRostersAvailable?: boolean;
  demoRostersReady?: boolean;
};

const mediaUrl = (key?: string) => key ? `/api/media?key=${encodeURIComponent(key)}` : "";
const scheduleIso = (value: string) => new Date(value).toISOString();
const matchStatusLabel: Record<string,string> = {scheduled:"Programmata",confirmed:"Confermata",live:"In corso",played:"Terminata",report_submitted:"Referto inviato",reviewing:"In verifica",official:"Ufficiale",rectified:"Rettificata",postponed:"Rinviata",recovery:"Recupero",cancelled:"Annullata"};
const auditLabel: Record<string,string> = {"match.created":"Partita creata","match.updated":"Programmazione modificata","callups.saved":"Convocati aggiornati","match.attendance_saved":"Presenze effettive confermate","match.events_saved":"Cronaca e statistiche aggiornate","match.ratings_saved":"Tabellino e voti aggiornati","report.submitted":"Referto inviato","result.officialized":"Risultato ufficializzato","result.rectified":"Risultato rettificato","error.reported":"Errore segnalato"};
const navItems: { id: Screen; label: string; icon: typeof Trophy }[] = [
  { id: "hub", label: "Hub tornei", icon: LayoutDashboard },
  { id: "public", label: "Portale pubblico", icon: Trophy },
  { id: "control", label: "Control Room", icon: Radio },
  { id: "club", label: "Area Società", icon: UsersRound },
  { id: "referee", label: "App Arbitro", icon: Flag },
];
const initialTournaments: Tournament[] = [
  {
    id: "t_fsl",
    name: "Future Stars League",
    edition: "2026/27",
    teamCount: 144,
    fieldCount: 3,
    status: "active",
    progress: 34,
    accent: "#f4ae2b",
  },
  {
    id: "t_amici",
    name: "Torneo degli Amici",
    edition: "Autunno 2026",
    teamCount: 10,
    fieldCount: 2,
    status: "active",
    progress: 61,
    accent: "#36c98f",
  },
  {
    id: "t_roma",
    name: "Roma Youth Cup",
    edition: "Primavera 2027",
    teamCount: 32,
    fieldCount: 4,
    status: "draft",
    progress: 12,
    accent: "#1778ff",
  },
];
const matches = [
  {
    time: "08:30",
    home: "Roma Nord",
    away: "Sporting EUR",
    field: "Campo 1",
    category: "2014 · Serie A",
  },
  {
    time: "09:10",
    home: "Academy Tuscolana",
    away: "Castelli Academy",
    field: "Campo 2",
    category: "2015 · Serie A",
  },
  {
    time: "09:50",
    home: "Atletico Prenestino",
    away: "Ostia Football",
    field: "Campo 3",
    category: "2014 · Serie B",
  },
];
const standings = [
  ["Roma Nord", 8, "+18", 22],
  ["Academy Tuscolana", 8, "+13", 19],
  ["Sporting EUR", 8, "+11", 17],
  ["Castelli Academy", 8, "+6", 14],
  ["Atletico Prenestino", 8, "+4", 13],
];
const scorers = [
  ["L. Ferri", "Roma Nord", 12, "LF"],
  ["M. Rinaldi", "Academy Tuscolana", 10, "MR"],
  ["A. De Santis", "Sporting EUR", 9, "AD"],
];

function Mark({ small = false }: { small?: boolean }) {
  return (
    <div
      className={`brand-mark ${small ? "brand-mark--small" : ""}`}
      aria-hidden="true"
    >
      <span>F</span>
      <i>S</i>
    </div>
  );
}
function Status({
  children,
  tone = "green",
}: {
  children: React.ReactNode;
  tone?: "green" | "gold" | "blue" | "red";
}) {
  return (
    <span className={`status status--${tone}`}>
      <i />
      {children}
    </span>
  );
}
function ClubBadge({
  initials,
  color = "blue",
}: {
  initials: string;
  color?: "blue" | "gold" | "red" | "green";
}) {
  return <span className={`club-badge club-badge--${color}`}>{initials}</span>;
}

const awardBadgeMeta:Record<string,{label:string;tone:string;icon:typeof Trophy}>={
  mvp:{label:"MVP",tone:"gold",icon:Trophy},
  top_goal:{label:"TOP GOAL",tone:"red",icon:Sparkles},
  top_save:{label:"TOP SAVE",tone:"blue",icon:ShieldCheck},
  rising_star:{label:"RISING STAR",tone:"violet",icon:WandSparkles},
  fair_play:{label:"FAIR PLAY",tone:"green",icon:Medal},
  best_defender:{label:"DIFENSORE",tone:"blue",icon:ShieldCheck},
  special:{label:"PREMIO",tone:"gold",icon:Star},
  MVP:{label:"MVP",tone:"gold",icon:Trophy},
  "Top Goal":{label:"TOP GOAL",tone:"red",icon:Sparkles},
  "Top Save":{label:"TOP SAVE",tone:"blue",icon:ShieldCheck},
  "Rising Star":{label:"RISING STAR",tone:"violet",icon:WandSparkles},
  "Fair Play":{label:"FAIR PLAY",tone:"green",icon:Medal},
  "Team of the Week":{label:"TEAM OF WEEK",tone:"blue",icon:UsersRound},
  "Coach of the Month":{label:"COACH",tone:"red",icon:Flag},
  "Club of the Year":{label:"CLUB OF YEAR",tone:"gold",icon:Building2},
  Esordio:{label:"PRIMO PASSO",tone:"blue",icon:Flag},
  Streak:{label:"STREAK",tone:"green",icon:Zap},
  Bomber:{label:"BOMBER 5+",tone:"red",icon:Trophy},
  "Assist King":{label:"ASSIST KING",tone:"violet",icon:Sparkles},
  Muro:{label:"PORTA BLINDATA",tone:"blue",icon:ShieldCheck},
  "MVP Streak":{label:"MVP SERIALE",tone:"gold",icon:Medal},
  "Elite 8":{label:"ELITE 8",tone:"gold",icon:Star},
  badge_debut:{label:"ESORDIO",tone:"blue",icon:Flag},
  badge_first_goal:{label:"PRIMO GOL",tone:"red",icon:Trophy},
  badge_double:{label:"DOPPIETTA",tone:"red",icon:Sparkles},
  badge_triple:{label:"TRIPLETTA",tone:"gold",icon:Trophy},
  badge_clean_sheet:{label:"CLEAN SHEET",tone:"blue",icon:ShieldCheck},
  badge_penalty_saver:{label:"PARA-RIGORI",tone:"violet",icon:ShieldCheck},
  badge_streak_5:{label:"SEMPRE PRESENTE",tone:"green",icon:Zap},
  badge_bomber_5:{label:"BOMBER 5",tone:"red",icon:Trophy},
  badge_bomber_10:{label:"BOMBER 10",tone:"gold",icon:Trophy},
  badge_bomber_20:{label:"BOMBER 20",tone:"gold",icon:Star},
  badge_assist_3:{label:"ASSIST KING",tone:"violet",icon:Sparkles},
  badge_assist_5:{label:"ASSIST KING 5",tone:"violet",icon:Sparkles},
  badge_assist_10:{label:"ASSIST KING 10",tone:"gold",icon:Sparkles},
  badge_wall_3:{label:"MURO",tone:"blue",icon:ShieldCheck},
  badge_mvp_streak_2:{label:"MVP SERIALE",tone:"gold",icon:Medal},
  badge_average_75:{label:"FUORICLASSE 7,5",tone:"violet",icon:Star},
  badge_average_80:{label:"ELITE 8",tone:"gold",icon:Star},
  badge_fair_play_5:{label:"FAIR PLAY",tone:"green",icon:Medal},
};
function AwardBadge({type,compact=false}:{type:string;compact?:boolean}){
  const meta=awardBadgeMeta[type]||{label:type.toUpperCase(),tone:"gold",icon:Trophy};
  const Icon=meta.icon;
  return <span className={`award-badge award-badge--${meta.tone} ${compact?"award-badge--compact":""}`} title={type}><i><Icon/></i>{!compact&&<b>{meta.label}</b>}</span>;
}

function SharedPlayerCard({playerId,onClose}:{playerId:string;onClose:()=>void}){
  const [data,setData]=useState<any>(null);const [missing,setMissing]=useState(false);
  useEffect(()=>{fetch(`/api/public/players/${playerId}`,{cache:"no-store"}).then(async r=>{const b=await r.json();if(!r.ok)throw new Error();setData(b)}).catch(()=>setMissing(true))},[playerId]);
  return <div className="shared-player-layer"><section className="shared-player-card"> <button className="icon-button" onClick={onClose}><X/></button>{missing?<div className="private-player"><LockKeyhole/><h2>Profilo protetto</h2><p>La società non ha autorizzato la pubblicazione di questa player card.</p></div>:!data?<div className="workspace-loading">Caricamento player card…</div>:<><div className="shared-player-visual" style={{"--club":data.player.primaryColor,"--club-2":data.player.secondaryColor} as React.CSSProperties}>{data.player.photoKey?<img src={mediaUrl(data.player.photoKey)} alt=""/>:<span>{data.player.shirtNumber||"FS"}</span>}<div><small>{data.futureStarsId}</small><h2>{data.player.publicName}</h2><b>#{data.player.shirtNumber||"—"} · {data.player.role}</b><em>{data.player.teamName}</em></div>{data.awards?.length>0&&<div className="shared-badge-row">{data.awards.slice(0,4).map((award:any)=><AwardBadge key={award.id} type={award.type}/>)}</div>}</div><div className="shared-stat-grid">{[["Presenze",data.stats[0]?.appearances||0],["Gol",data.stats[0]?.goals||0],["Assist",data.stats[0]?.assists||0],["MVP",data.stats[0]?.mvpAwards||0],["Media",data.fantasy?.[0]?.averageRating?Number(data.fantasy[0].averageRating).toFixed(2).replace(".",","):"—"]].map(([label,value])=><span key={String(label)}><strong>{value}</strong>{label}</span>)}</div>{data.player.bio&&<p className="shared-player-bio">{data.player.bio}</p>}<div className="shared-palmares"><h3>Palmarès e momenti</h3>{[...data.awards,...data.milestones].slice(0,8).map((item:any,index:number)=><article key={`${item.title}-${index}`}>{item.type?<AwardBadge compact type={item.type}/>:<Sparkles/>}<span><b>{item.title}</b><small>{item.automatic?"Automatico · dati ufficiali":item.note||item.description}</small></span></article>)}</div></>}</section></div>
}

function AppShell() {
  const [screen, setScreen] = useState<Screen>("hub");
  const [tournament, setTournament] = useState("t_fsl");
  const [archive, setArchive] = useState(false);
  const [tournamentStartTab, setTournamentStartTab] = useState<TournamentTab>("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState("");
  const [sharedPlayer,setSharedPlayer]=useState<string|null>(null);
  const [savedTournaments, setSavedTournaments] =
    useState<Tournament[]>(initialTournaments);
  const [user, setUser] = useState<CurrentUser>({
    id: "",
    name: "Giampaolo",
    email: "",
    role: "SUPER_ADMIN",
  });
  const [dataState, setDataState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }
  const title = useMemo(
    () =>
      screen === "tournament"
        ? (savedTournaments.find((item) => item.id === tournament)?.name ??
          "Gestione torneo")
        : (navItems.find((n) => n.id === screen)?.label ?? "Nuovo torneo"),
    [screen, tournament, savedTournaments],
  );
  useEffect(() => {
    setSharedPlayer(new URLSearchParams(window.location.search).get("player"));
  }, []);
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(
      context.registerTool(
        {
          name: "navigate_future_stars_surface",
          title: "Apri area Future Stars League",
          description:
            "Apre una delle aree visibili della demo: hub, portale pubblico, control room, area società oppure app arbitro.",
          inputSchema: {
            type: "object",
            properties: {
              surface: {
                type: "string",
                enum: ["hub", "public", "control", "club", "referee"],
              },
            },
            required: ["surface"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute: (input: unknown) => {
            const value = (input as { surface?: string })?.surface;
            if (
              !["hub", "public", "control", "club", "referee"].includes(
                value ?? "",
              )
            )
              throw new Error("Area non valida");
            setScreen(value as Screen);
            return { surface: value, status: "opened" };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);
  useEffect(() => {
    let live = true;
    fetch("/api/bootstrap", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        if (live) {
          setSavedTournaments(body.tournaments);
          setUser(body.user);
          setDataState("ready");
        }
      })
      .catch(() => {
        if (live) setDataState("error");
      });
    return () => {
      live = false;
    };
  }, []);
  async function archiveTournament(id: string) {
    const response = await fetch(`/api/tournaments/${id}/archive`, {
      method: "POST",
    });
    const body = await response.json();
    if (!response.ok) {
      notify(body.error ?? "Impossibile archiviare il torneo");
      return;
    }
    setSavedTournaments((items) =>
      items.map((item) =>
        item.id === id ? { ...item, status: "archived" } : item,
      ),
    );
    notify("Torneo archiviato e registrato nell'audit");
  }
  function openTournament(id: string, tab: TournamentTab = "overview") {
    setTournament(id);
    setTournamentStartTab(tab);
    setScreen("tournament");
    setMobileNav(false);
  }
  function addTournament(item: Tournament) {
    setSavedTournaments((items) => [...items, item]);
    setTournament(item.id);
    setScreen("tournament");
    notify("Torneo vuoto creato: ora inserisci struttura e squadre");
  }
  const visibleNav = navItems.filter((item) => {
    if (user.role === "SUPER_ADMIN") return true;
    if (user.role === "TOURNAMENT_DIRECTOR")
      return ["hub", "public", "control"].includes(item.id);
    if (user.role === "SECRETARIAT") return ["hub", "club"].includes(item.id);
    if (user.role === "REFEREE") return ["hub", "referee"].includes(item.id);
    if (user.role === "CLUB_MANAGER") return ["hub", "club"].includes(item.id);
    return item.id === "public";
  });
  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar--open" : ""}`}>
        <div className="sidebar__brand">
          <Mark />
          <div>
            <b>FUTURE</b>
            <span>STARS LEAGUE</span>
          </div>
        </div>
        <nav aria-label="Navigazione principale">
          <p className="eyebrow">Piattaforma</p>
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={screen === item.id ? "active" : ""}
                onClick={() => {
                  setScreen(item.id);
                  setMobileNav(false);
                }}
              >
                <Icon size={19} />
                <span>{item.label}</span>
              </button>
            );
          })}
          {user.role === "SUPER_ADMIN" && <><p className="eyebrow eyebrow--space">Gestione</p>
          <button
            onClick={() => openTournament(tournament, "payments")}
          >
            <CircleDollarSign size={19} />
            <span>Pagamenti</span>
          </button>
          <button onClick={() => openTournament(tournament, "structure")}>
            <Settings size={19} />
            <span>Impostazioni</span>
          </button></>}
        </nav>
        <div className="sidebar__profile">
          <span className="avatar">
            {user.name
              .split(" ")
              .map((v) => v[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <div>
            <strong>{user.name.split(" ")[0]}</strong>
            <small>{user.role.replaceAll("_", " ")}</small>
          </div>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Apri menu"
            onClick={() => setMobileNav(!mobileNav)}
          >
            {mobileNav ? <X /> : <Menu />}
          </button>
          <div>
            <p className="eyebrow">Future Stars League</p>
            <h1>{title}</h1>
          </div>
          <div className="topbar__actions">
            <label className="tournament-select">
              <Trophy size={17} />
              <select
                value={tournament}
                onChange={(e) => openTournament(e.target.value)}
                aria-label="Torneo selezionato"
              >
                {savedTournaments
                  .filter((item) => item.status !== "archived")
                  .map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name} · {item.edition}
                    </option>
                  ))}
              </select>
              <ChevronDown size={15} />
            </label>
            <button
              className="icon-button"
              aria-label="Notifiche"
              onClick={() => openTournament(tournament, "errors")}
            >
              <Bell size={19} />
              <i className="notification-dot" />
            </button>
            {user.role === "SUPER_ADMIN" && <button
              className="primary-button"
              onClick={() => setScreen("create")}
            >
              <Plus size={18} /> Nuovo torneo
            </button>}
          </div>
        </header>
        <div className="content">
          {dataState === "error" && (
            <div className="data-warning">
              Dati temporaneamente non disponibili: visualizzazione dimostrativa
              attiva.
            </div>
          )}
          {screen === "hub" && (
            <HubScreen
              archive={archive}
              setArchive={setArchive}
              setScreen={setScreen}
              openTournament={openTournament}
              tournaments={savedTournaments}
              onArchive={archiveTournament}
              loading={dataState === "loading"}
              canCreate={user.role === "SUPER_ADMIN"}
              canControl={["SUPER_ADMIN", "TOURNAMENT_DIRECTOR"].includes(user.role)}
            />
          )}{" "}
          {screen === "tournament" && (
            <TournamentScreen
              tournamentId={tournament}
              initialTab={tournamentStartTab}
              onBack={() => setScreen("hub")}
              notify={notify}
            />
          )}{" "}
          {screen === "public" && <ConnectedPublicScreen tournamentId={tournament} />} {" "}
          {screen === "control" && <LiveControlScreen tournamentId={tournament} notify={notify} />}{" "}
          {screen === "club" && <ConnectedClubScreen tournamentId={tournament} notify={notify} />}{" "}
          {screen === "referee" && <ConnectedRefereeScreen tournamentId={tournament} notify={notify} />}{" "}
          {screen === "create" && (
            <CreateScreen
              onBack={() => setScreen("hub")}
              notify={notify}
              onCreated={addTournament}
            />
          )}
        </div>
      </section>
      {mobileNav && (
        <button
          className="nav-overlay"
          aria-label="Chiudi menu"
          onClick={() => setMobileNav(false)}
        />
      )}{" "}
      {toast && (
        <div className="toast">
          <Check size={18} />
          {toast}
        </div>
      )}
      {sharedPlayer&&<SharedPlayerCard playerId={sharedPlayer} onClose={()=>{setSharedPlayer(null);window.history.replaceState({},"",window.location.pathname)}}/>}
    </main>
  );
}

function HubScreen({
  archive,
  setArchive,
  setScreen,
  openTournament,
  tournaments,
  onArchive,
  loading,
  canCreate,
  canControl,
}: {
  archive: boolean;
  setArchive: (v: boolean) => void;
  setScreen: (v: Screen) => void;
  openTournament: (id: string, tab?: TournamentTab) => void;
  tournaments: Tournament[];
  onArchive: (id: string) => void;
  loading: boolean;
  canCreate: boolean;
  canControl: boolean;
}) {
  const current = tournaments.filter((item) => item.status !== "archived");
  const archived = tournaments.filter((item) => item.status === "archived");
  const active = current.filter((item) => item.status === "active");
  const primaryTournament = active[0] || current[0];
  const teams = current.reduce((sum, item) => sum + item.teamCount, 0);
  const matchCount = current.reduce((sum, item) => sum + Number(item.matchCount || 0), 0);
  const playedCount = current.reduce((sum, item) => sum + Number(item.playedCount || 0), 0);
  const upcomingCount = current.reduce((sum, item) => sum + Number(item.upcomingCount || 0), 0);
  return (
    <>
      <section className="hero-strip">
        <div className="hero-strip__copy">
          <Status tone="gold">Stagione in corso</Status>
          <h2>
            OGNI TORNEO.
            <br />
            <em>UNA GRANDE STORIA.</em>
          </h2>
          <p>
            Organizza competizioni, società e weekend di gara da un unico centro
            operativo.
          </p>
          <div className="hero-strip__buttons">
            {canCreate && <button className="gold-button" onClick={() => setScreen("create")}>
              <Plus size={18} /> Crea torneo
            </button>}
            {canControl && <button
              className="ghost-button"
              onClick={() => setScreen("control")}
            >
              <Radio size={18} /> Apri Control Room
            </button>}
          </div>
        </div>
        <div className="field-graphic" aria-hidden="true">
          <div className="field-graphic__circle" />
          <span className="big-number">26</span>
          <small>
            STAGIONE
            <br />
            2026/27
          </small>
        </div>
      </section>
      <section className="metric-grid hub-metric-links">
        <button onClick={() => { setArchive(false); document.getElementById("hub-tournaments")?.scrollIntoView({ behavior: "smooth" }); }}>
          <span>TORNEI ATTIVI</span>
          <strong>{loading ? "—" : active.length}</strong>
          <small>
            <b>+{current.filter((i) => i.status === "draft").length}</b> in
            preparazione
          </small>
        </button>
        <button disabled={!primaryTournament} onClick={() => primaryTournament && openTournament(primaryTournament.id, "teams")}>
          <span>SQUADRE COINVOLTE</span>
          <strong>{loading ? "—" : teams}</strong>
          <small>Dati salvati per torneo</small>
        </button>
        <button disabled={!primaryTournament} onClick={() => primaryTournament && openTournament(primaryTournament.id, "matches")}>
          <span>GARE PROGRAMMATE</span>
          <strong>{loading ? "—" : matchCount}</strong>
          <small>
            <b>{playedCount}</b> già ufficiali
          </small>
        </button>
        <button disabled={!canControl} onClick={() => canControl && setScreen("control")}>
          <span>PROSSIMO WEEKEND</span>
          <strong>{loading ? "—" : upcomingCount}</strong>
          <small>Gare nei prossimi 7 giorni</small>
        </button>
      </section>
      <section className="section-head" id="hub-tournaments">
        <div>
          <p className="eyebrow">Il tuo ecosistema</p>
          <h2>Tornei</h2>
        </div>
        <div className="segmented">
          <button
            className={!archive ? "selected" : ""}
            onClick={() => setArchive(false)}
          >
            Attivi
          </button>
          <button
            className={archive ? "selected" : ""}
            onClick={() => setArchive(true)}
          >
            <Archive size={15} /> Archivio
          </button>
        </div>
      </section>
      {!archive ? (
        <div className="tournament-grid">
          {current.map((item) => (
            <article
              className="tournament-card"
              key={item.id}
              style={{ "--accent": item.accent } as React.CSSProperties}
              role="button"
              tabIndex={0}
              onClick={() => openTournament(item.id)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openTournament(item.id); }}
            >
              <div className="tournament-card__top">
                <span className="mini-shield">
                  {item.name
                    .split(" ")
                    .map((v) => v[0])
                    .join("")
                    .slice(0, 3)}
                </span>
                <Status tone={item.status === "draft" ? "blue" : "green"}>
                  {item.status === "draft" ? "Bozza" : "Attivo"}
                </Status>
              </div>
              <div>
                <p className="eyebrow">{item.edition}</p>
                <h3>{item.name}</h3>
              </div>
              <div className="tournament-card__facts">
                <span>
                  <UsersRound /> <b>{item.teamCount}</b> previste
                </span>
                <span>
                  <MapPin /> <b>{item.fieldCount}</b> campi
                </span>
              </div>
              <div className="progress-label">
                <span>Avanzamento stagione</span>
                <b>{item.progress}%</b>
              </div>
              <div className="progress">
                <i style={{ width: `${item.progress}%` }} />
              </div>
              <div className="card-actions">
                <button onClick={(event) => { event.stopPropagation(); openTournament(item.id); }}>
                  Apri gestione <ChevronRight size={16} />
                </button>
                {canCreate && <button
                  className="archive-action"
                  onClick={(event) => { event.stopPropagation(); onArchive(item.id); }}
                  aria-label={`Archivia ${item.name}`}
                >
                  <Archive size={14} />
                </button>}
              </div>
            </article>
          ))}
          {canCreate && <button
            className="new-tournament-card"
            onClick={() => setScreen("create")}
          >
            <span>
              <Plus />
            </span>
            <strong>Crea un nuovo torneo</strong>
            <small>Nasce vuoto: struttura e squadre le inserisci tu</small>
          </button>}
        </div>
      ) : (
        <div className="archive-list">
          {archived.length ? (
            archived.map((item) => (
              <button className="archive-panel archive-panel--button" key={item.id} onClick={() => openTournament(item.id)}>
                <Archive size={34} />
                <div>
                  <h3>{item.name}</h3>
                  <p>
                    {item.edition} · {item.teamCount} squadre · sola lettura
                  </p>
                </div>
                <Status tone="blue">Archiviato</Status>
              </button>
            ))
          ) : (
            <div className="archive-panel">
              <Archive size={34} />
              <div>
                <h3>Archivio vuoto</h3>
                <p>I tornei terminati appariranno qui.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function MatchDrawer({
  match,
  onClose,
}: {
  match: MatchDetail;
  onClose: () => void;
}) {
  if (!match.id.startsWith("demo-"))
    return <OperationalMatchDrawer matchId={match.id} onClose={onClose} />;
  const date = new Date(match.startsAt);
  return (
    <div
      className="drawer-layer"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        className="match-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Dettaglio partita"
      >
        <header>
          <div>
            <p className="eyebrow">
              Giornata {match.matchDay} · {match.category} {match.division}
            </p>
            <h2>Dettaglio partita</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Chiudi">
            <X />
          </button>
        </header>
        <div className="drawer-score">
          <small>
            {date.toLocaleDateString("it-IT", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}{" "}
            ·{" "}
            {date.toLocaleTimeString("it-IT", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </small>
          <div>
            <span>
              <ClubBadge initials={match.homeShort} color="red" />
              <b>{match.home}</b>
            </span>
            <strong>VS</strong>
            <span>
              <ClubBadge initials={match.awayShort} color="blue" />
              <b>{match.away}</b>
            </span>
          </div>
          <Status tone={match.status === "official" ? "green" : "gold"}>
            {match.status === "scheduled" ? "Programmato" : match.status}
          </Status>
        </div>
        <div className="match-info-grid">
          <div>
            <MapPin />
            <span>
              <small>Sede e campo</small>
              <b>
                {match.venue} · {match.field}
              </b>
            </span>
          </div>
          <div>
            <Flag />
            <span>
              <small>Arbitro</small>
              <b>{match.refereeName || "Da assegnare"}</b>
            </span>
          </div>
          <div>
            <FileCheck2 />
            <span>
              <small>Referto</small>
              <b>
                {match.status === "scheduled"
                  ? "Non ancora compilato"
                  : "Disponibile"}
              </b>
            </span>
          </div>
          <div>
            <Shirt />
            <span>
              <small>Formato</small>
              <b>Tempo unico · 30 minuti</b>
            </span>
          </div>
        </div>
        <section className="callups">
          <div className="callup-column">
            <h3>
              {match.home}
              <span>{match.callups.home.length} convocati</span>
            </h3>
            {match.callups.home.length ? (
              match.callups.home.map((player, index) => (
                <div key={player}>
                  <span>{index + 1}</span>
                  {player}
                </div>
              ))
            ) : (
              <p>Convocati non ancora inseriti.</p>
            )}
          </div>
          <div className="callup-column">
            <h3>
              {match.away}
              <span>{match.callups.away.length} convocati</span>
            </h3>
            {match.callups.away.length ? (
              match.callups.away.map((player, index) => (
                <div key={player}>
                  <span>{index + 1}</span>
                  {player}
                </div>
              ))
            ) : (
              <p>Convocati non ancora inseriti.</p>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

function MatchRosterPreview({title,shortName,color,crestKey,players,calledIds,awards=[],onPlayer}:{title:string;shortName:string;color:string;crestKey?:string;players:Player[];calledIds:string[];awards?:AwardEntry[];onPlayer:(player:Player)=>void}){
  return <section className="preview-roster"><header><i style={{background:color}}>{crestKey?<img src={mediaUrl(crestKey)} alt=""/>:shortName}</i><div><h3>{title}</h3><span>{calledIds.length} convocati · clicca un atleta per aprire la scheda</span></div></header><div>{players.length?players.map(player=>{const called=calledIds.includes(player.id);const playerBadges=awards.filter(award=>award.playerId===player.id);return <button type="button" key={player.id} className={called?"called":""} onClick={()=>onPlayer(player)} aria-label={`Apri la scheda di ${player.firstName} ${player.lastName}`}><span className="preview-player-photo">{player.photoKey?<img src={mediaUrl(player.photoKey)} alt=""/>:player.shirtNumber??"—"}</span><b>{player.firstName} {player.lastName}<small>#{player.shirtNumber??"—"} · {player.role}</small>{playerBadges.length>0&&<em className="match-player-badges">{playerBadges.slice(0,2).map(award=><AwardBadge compact key={award.id} type={award.type}/>)}</em>}</b><Status tone={called?"green":"blue"}>{called?"Convocato":"Rosa"}</Status><ChevronRight/></button>}):<p>Rosa non ancora inserita.</p>}</div></section>
}

function MatchEventsEditor({match,homePlayers,awayPlayers,homeCalled,awayCalled,events,setEvents,locked,saving,onSave}:{match:any;homePlayers:Player[];awayPlayers:Player[];homeCalled:string[];awayCalled:string[];events:MatchEvent[];setEvents:(events:MatchEvent[])=>void;locked:boolean;saving:boolean;onSave:()=>void}){
  const labels:Record<string,string>={goal:"Gol",own_goal:"Autogol",yellow_card:"Ammonizione",red_card:"Espulsione",mvp:"MVP"};
  const available=(teamId:string)=>{const players=teamId===match.homeTeamId?homePlayers:awayPlayers;const called=teamId===match.homeTeamId?homeCalled:awayCalled;return called.length?players.filter(player=>called.includes(player.id)):players};
  const add=()=>{const teamId=match.homeTeamId,player=available(teamId)[0];if(player)setEvents([...events,{id:crypto.randomUUID(),teamId,playerId:player.id,type:"goal",minute:0}])};
  const change=(index:number,patch:Partial<MatchEvent>)=>setEvents(events.map((event,i)=>i===index?{...event,...patch}:event));
  const homeGoals=events.filter(event=>(event.type==="goal"&&event.teamId===match.homeTeamId)||(event.type==="own_goal"&&event.teamId===match.awayTeamId)).length,awayGoals=events.filter(event=>(event.type==="goal"&&event.teamId===match.awayTeamId)||(event.type==="own_goal"&&event.teamId===match.homeTeamId)).length;
  return <section className="match-events-editor"><header><div><p className="eyebrow">Referto digitale</p><h3>Cronaca e statistiche</h3><span>Gol registrati {homeGoals}–{awayGoals} · questi eventi alimentano le statistiche ufficiali</span></div>{!locked&&<button className="ghost-button" onClick={add}><Plus/> Aggiungi evento</button>}</header><div className="match-event-list">{events.length?events.map((event,index)=>{const players=available(event.teamId);return <article key={event.id}><input aria-label="Minuto" type="number" min="0" max="240" value={event.minute} disabled={locked} onChange={e=>change(index,{minute:Number(e.target.value)})}/><span className="event-minute">′</span><select aria-label="Tipo evento" value={event.type} disabled={locked} onChange={e=>change(index,{type:e.target.value as MatchEvent["type"],assistPlayerId:e.target.value==="goal"?event.assistPlayerId:null})}>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><select aria-label="Squadra" value={event.teamId} disabled={locked} onChange={e=>{const teamId=e.target.value;change(index,{teamId,playerId:available(teamId)[0]?.id||"",assistPlayerId:null})}}><option value={match.homeTeamId}>{match.home}</option><option value={match.awayTeamId}>{match.away}</option></select><select aria-label="Giocatore" value={event.playerId} disabled={locked} onChange={e=>change(index,{playerId:e.target.value})}>{players.map(player=><option key={player.id} value={player.id}>#{player.shirtNumber??"—"} · {player.firstName} {player.lastName}</option>)}</select>{event.type==="goal"?<select aria-label="Assist" value={event.assistPlayerId||""} disabled={locked} onChange={e=>change(index,{assistPlayerId:e.target.value||null})}><option value="">Nessun assist</option>{players.filter(player=>player.id!==event.playerId).map(player=><option key={player.id} value={player.id}>{player.firstName} {player.lastName}</option>)}</select>:<span className="event-no-assist">—</span>}{!locked&&<button className="row-trash" aria-label="Elimina evento" onClick={()=>setEvents(events.filter((_,i)=>i!==index))}><Trash2/></button>}</article>}):<div className="events-empty"><ListPlus/><b>Nessun evento inserito</b><span>Aggiungi gol, assist, cartellini e MVP prima di chiudere il referto.</span></div>}</div>{!locked&&<footer><span>Le rettifiche ricalcolano tutto senza duplicare i dati.</span><button className="gold-button" disabled={saving} onClick={onSave}><Save/> Salva cronaca</button></footer>}</section>
}

const ratingModifiers=[
  {id:"goal",label:"Gol",value:3},{id:"assist",label:"Assist",value:1},{id:"clean_sheet",label:"Porta inviolata",value:3},
  {id:"missed_penalty",label:"Rigore sbagliato",value:-3},{id:"saved_penalty",label:"Rigore parato",value:3},
  {id:"yellow_card",label:"Ammonizione",value:-.5},{id:"red_card",label:"Espulsione",value:-1},{id:"mvp",label:"MVP",value:1},
  {id:"own_goal",label:"Autogol",value:-2},{id:"conceded_goal",label:"Gol subito",value:-1},
] as const;
const ratingValue=(modifiers:string[])=>modifiers.reduce((total,id)=>total+(ratingModifiers.find(item=>item.id===id)?.value||0),0);
const formatRating=(value:number)=>value.toLocaleString("it-IT",{minimumFractionDigits:1,maximumFractionDigits:1});

function UnifiedMatchSheet({match,homePlayers,awayPlayers,homeCalled,setHomeCalled,awayCalled,setAwayCalled,statuses,setStatuses,ratings,setRatings,awards=[],editableTeamIds,canEditMatch,mode,setMode,saving,onSave,onPlayer}:{match:any;homePlayers:Player[];awayPlayers:Player[];homeCalled:string[];setHomeCalled:(ids:string[])=>void;awayCalled:string[];setAwayCalled:(ids:string[])=>void;statuses:Record<string,string>;setStatuses:(value:Record<string,string>)=>void;ratings:MatchPlayerRating[];setRatings:(rows:MatchPlayerRating[])=>void;awards?:AwardEntry[];editableTeamIds:string[];canEditMatch:boolean;mode:"template"|"match";setMode:(mode:"template"|"match")=>void;saving:boolean;onSave:(mode:"template"|"match")=>void;onPlayer:(player:Player,teamId:string)=>void}){
  const canEditTemplate=editableTeamIds.length>0;
  const effectiveMode: "template"|"match"=!canEditMatch?"template":!canEditTemplate?"match":mode;
  const allCalled=[...homeCalled,...awayCalled];
  const presentCount=allCalled.filter(id=>["starter","present"].includes(statuses[id])).length;
  const absentCount=allCalled.filter(id=>statuses[id]==="absent").length;
  const rowFor=(playerId:string,teamId:string)=>ratings.find(row=>row.playerId===playerId)||{playerId,teamId,baseRatingTenths:60,manualDeltaTenths:0,modifiers:[],finalRatingTenths:60};
  const updateRating=(playerId:string,teamId:string,change:(row:MatchPlayerRating)=>MatchPlayerRating)=>{const current=rowFor(playerId,teamId),next=change(current);next.finalRatingTenths=Math.round((6+next.manualDeltaTenths/10+ratingValue(next.modifiers))*10);setRatings(ratings.some(row=>row.playerId===playerId)?ratings.map(row=>row.playerId===playerId?next:row):[...ratings,next])};
  const mvpPlayer=ratings.find(row=>row.modifiers.includes("mvp"))?.playerId;
  const cycleAttendance=(playerId:string)=>{const current=statuses[playerId]||"called";const next=current==="called"?"present":["present","starter"].includes(current)?"absent":"called";setStatuses({...statuses,[playerId]:next})};
  const renderTeam=(teamId:string,teamName:string,shortName:string,color:string,crestKey:string|undefined,players:Player[],calledIds:string[],setCalledIds:(ids:string[])=>void)=>{
    const visible=effectiveMode==="template"?players:players.filter(player=>calledIds.includes(player.id));
    const teamEditable=editableTeamIds.includes(teamId);
    return <section className="unified-team"><header><i style={{background:color}}>{crestKey?<img src={mediaUrl(crestKey)} alt=""/>:shortName}</i><div><h4>{teamName}</h4><span>{calledIds.length} in distinta</span></div></header><div className="unified-player-list">{visible.length?visible.map(player=>{const called=calledIds.includes(player.id),status=statuses[player.id]||"called",isPresent=["starter","present"].includes(status),row=rowFor(player.id,teamId),technical=6+row.manualDeltaTenths/10,total=technical+ratingValue(row.modifiers),isKeeper=/port|goal/i.test(player.role||""),playerBadges=awards.filter(award=>award.playerId===player.id);const numberClass=effectiveMode==="template"?(called?"is-called":"is-neutral"):(isPresent?"is-present":status==="absent"?"is-absent":"is-neutral");return <article key={player.id} className={`${!called&&effectiveMode==="template"?"is-out":""} ${effectiveMode==="match"?"is-match-row":""}`}>
      <div className="unified-player-main"><button type="button" className={`shirt-status ${numberClass}`} disabled={effectiveMode==="template"?!teamEditable:!canEditMatch} onClick={()=>effectiveMode==="template"?setCalledIds(called?calledIds.filter(id=>id!==player.id):[...calledIds,player.id]):cycleAttendance(player.id)} aria-label={effectiveMode==="template"?`${called?"Rimuovi":"Convoca"} ${player.firstName} ${player.lastName}`:`Cambia presenza di ${player.firstName} ${player.lastName}`}>{player.shirtNumber??"—"}</button><button type="button" className="unified-player-name" onClick={()=>onPlayer(player,teamId)}><b>{player.firstName} {player.lastName}</b><small>{player.role||"Ruolo da definire"}{effectiveMode==="match"?` · ${isPresent?"Presente":status==="absent"?"Assente":"Da confermare"}`:""}</small></button>{playerBadges.length>0&&<em className="match-player-badges">{playerBadges.slice(0,1).map(award=><AwardBadge compact key={award.id} type={award.type}/>)}</em>}</div>
      {effectiveMode==="match"&&isPresent&&<div className="unified-player-rating"><div className="rating-stepper compact"><button disabled={!canEditMatch||technical<=3} onClick={()=>updateRating(player.id,teamId,value=>({...value,manualDeltaTenths:value.manualDeltaTenths-5}))}>−</button><span><small>Voto</small><b>{formatRating(technical)}</b></span><button disabled={!canEditMatch||technical>=10} onClick={()=>updateRating(player.id,teamId,value=>({...value,manualDeltaTenths:value.manualDeltaTenths+5}))}>+</button></div><div className="rating-bonuses compact"><select value="" disabled={!canEditMatch} aria-label={`Bonus e malus di ${player.firstName} ${player.lastName}`} onChange={e=>{const modifier=e.target.value;if(modifier)updateRating(player.id,teamId,value=>({...value,modifiers:[...value.modifiers,modifier]}))}}><option value="">Bonus / malus</option>{ratingModifiers.filter(option=>!["clean_sheet","saved_penalty","conceded_goal"].includes(option.id)||isKeeper).map(option=><option key={option.id} value={option.id} disabled={option.id==="mvp"&&Boolean(mvpPlayer&&mvpPlayer!==player.id)}>{option.label} {option.value>0?"+":""}{String(option.value).replace(".",",")}</option>)}</select><div>{row.modifiers.map((modifier,index)=>{const option=ratingModifiers.find(item=>item.id===modifier);return option?<button type="button" disabled={!canEditMatch} key={`${modifier}-${index}`} onClick={()=>updateRating(player.id,teamId,value=>({...value,modifiers:value.modifiers.filter((_,i)=>i!==index)}))}>{option.label} <b>{option.value>0?"+":""}{String(option.value).replace(".",",")}</b><X/></button>:null})}</div></div><strong className="final-rating"><small>Totale</small>{formatRating(total)}</strong></div>}
    </article>}):<div className="unified-empty"><UsersRound/><b>{effectiveMode==="template"?"Rosa non ancora inserita":"Distinta non compilata"}</b><span>{effectiveMode==="template"?"Aggiungi prima i giocatori alla squadra.":"La società o l’admin devono selezionare i convocati."}</span></div>}</div></section>;
  };
  return <section className="unified-match-sheet"><header><div><p className="eyebrow">Maschera globale</p><h3>Tabellino gara</h3><span>{effectiveMode==="template"?"La società o l’admin selezionano i convocati direttamente dalla rosa.":`${presentCount} presenti · ${absentCount} assenti · ${allCalled.length-presentCount-absentCount} da confermare`}</span></div>{canEditTemplate&&canEditMatch&&<div className="sheet-mode-switch"><button className={effectiveMode==="template"?"active":""} onClick={()=>setMode("template")}>Prepara distinta</button><button className={effectiveMode==="match"?"active":""} onClick={()=>setMode("match")}>Compila gara</button></div>}</header>{effectiveMode==="match"&&<div className="sheet-instructions"><span><i className="is-neutral"/> Da confermare</span><span><i className="is-present"/> 1 clic: presente</span><span><i className="is-absent"/> 2 clic: assente</span><small>Un terzo clic riporta il giocatore da confermare.</small></div>}<div className="unified-team-grid">{renderTeam(match.homeTeamId,match.home,match.homeShort,match.homeColor||"#e54835",match.homeCrestKey,homePlayers,homeCalled,setHomeCalled)}{renderTeam(match.awayTeamId,match.away,match.awayShort,match.awayColor||"#1778ff",match.awayCrestKey,awayPlayers,awayCalled,setAwayCalled)}</div>{((effectiveMode==="template"&&canEditTemplate)||(effectiveMode==="match"&&canEditMatch))&&<footer><span>{effectiveMode==="template"?"Una sola distinta alimenta presenze, quote e tabellino.":"Presenza, voto tecnico e bonus vengono salvati insieme."}</span><button className="gold-button" disabled={saving} onClick={()=>onSave(effectiveMode)}><Save/> {effectiveMode==="template"?"Salva distinta":"Salva tabellino completo"}</button></footer>}</section>;
}

function PostMatchStudio({match,homeScore,awayScore,players,awards=[]}:{match:any;homeScore:number;awayScore:number;players:any[];awards?:AwardEntry[]}){
  const mvp=players.find(player=>player.modifiers?.includes("mvp"))||players[0];
  if(!mvp)return null;
  const official=["official","rectified"].includes(match.status),top=players.slice(0,3);
  return <section className="post-match-studio"><header><div><p className="eyebrow">Social Match Center</p><h3>Grafica post-partita automatica</h3><span>Risultato, protagonista e migliori voti già impaginati.</span></div><Status tone={official?"green":"gold"}>{official?"Pronta da pubblicare":"Anteprima"}</Status></header><div className="post-match-layout"><article className="post-match-card" style={{"--home":match.homeColor||"#e54835","--away":match.awayColor||"#1778ff"} as React.CSSProperties}><div className="post-match-brand"><span>FUTURE STARS LEAGUE</span><small>{match.tournamentName} · {match.tournamentEdition} · {match.category} {match.division}</small></div><div className="post-match-scoreboard"><span><i>{match.homeShort}</i><b>{match.home}</b></span><strong>{homeScore}<em>–</em>{awayScore}</strong><span><i>{match.awayShort}</i><b>{match.away}</b></span></div><div className="post-match-mvp"><small>MVP DELLA PARTITA</small><h4>{mvp.firstName} {mvp.lastName}</h4><span>{mvp.teamName} · #{mvp.shirtNumber??"—"}</span><strong>{formatRating(mvp.finalRatingTenths/10)}<em>FANTASY RATING</em></strong></div><footer>{top.map((player,index)=><span key={player.playerId}><i>{index+1}</i><b>{player.firstName} {player.lastName}</b><em>{formatRating(player.finalRatingTenths/10)}</em></span>)}</footer></article><aside><div><small>CONTENUTI INCLUSI</small><h4>Pronta per Instagram e WhatsApp</h4><p>Formato verticale 1080×1350. I dati vengono rigenerati dopo ogni rettifica.</p></div>{awards.length>0&&<div className="post-match-awards">{awards.slice(0,3).map(award=><span key={award.id}><Medal/><b>{award.title}</b>{award.recipientName}</span>)}</div>}<button className="gold-button" onClick={()=>void matchGraphic(match,homeScore,awayScore,mvp,top,awards,false)}><Download/> Scarica PNG</button><button className="ghost-button" onClick={()=>void matchGraphic(match,homeScore,awayScore,mvp,top,awards,true)}><Share2/> Condividi</button></aside></div></section>
}

function MatchRatingsEditor({match,homePlayers,awayPlayers,statuses,ratings,setRatings,locked,saving,onSave}:{match:any;homePlayers:Player[];awayPlayers:Player[];statuses:Record<string,string>;ratings:MatchPlayerRating[];setRatings:(rows:MatchPlayerRating[])=>void;locked:boolean;saving:boolean;onSave:()=>void}){
  const players=[...homePlayers.map(player=>({...player,teamId:match.homeTeamId,teamName:match.home})),...awayPlayers.map(player=>({...player,teamId:match.awayTeamId,teamName:match.away}))].filter(player=>["starter","present"].includes(statuses[player.id]));
  const rowFor=(playerId:string,teamId:string)=>ratings.find(row=>row.playerId===playerId)||{playerId,teamId,baseRatingTenths:60,manualDeltaTenths:0,modifiers:[],finalRatingTenths:60};
  const update=(playerId:string,teamId:string,change:(row:MatchPlayerRating)=>MatchPlayerRating)=>{const current=rowFor(playerId,teamId),next=change(current);next.finalRatingTenths=Math.round((6+next.manualDeltaTenths/10+ratingValue(next.modifiers))*10);setRatings(ratings.some(row=>row.playerId===playerId)?ratings.map(row=>row.playerId===playerId?next:row):[...ratings,next])};
  const mvpPlayer=ratings.find(row=>row.modifiers.includes("mvp"))?.playerId;
  return <section className="match-ratings-editor"><header><div><p className="eyebrow">Tabellino gara</p><h3>Voti, bonus e malus</h3><span>Ogni atleta parte da 6. Il voto tecnico cambia di 0,5; bonus e malus determinano il totale finale.</span></div><BarChart3/></header>{players.length?<div className="rating-team-groups">{[[match.homeTeamId,match.home],[match.awayTeamId,match.away]].map(([teamId,teamName])=><section key={teamId}><h4>{teamName}</h4>{players.filter(player=>player.teamId===teamId).map(player=>{const row=rowFor(player.id,teamId),technical=6+row.manualDeltaTenths/10,total=technical+ratingValue(row.modifiers),isKeeper=/port|goal/i.test(player.role||"");return <article key={player.id}><div className="rating-player"><span className="preview-player-photo">{player.photoKey?<img src={mediaUrl(player.photoKey)} alt=""/>:player.shirtNumber??"—"}</span><b>{player.firstName} {player.lastName}<small>#{player.shirtNumber??"—"} · {player.role}</small></b></div><div className="rating-stepper"><button disabled={locked||technical<=3} onClick={()=>update(player.id,teamId,value=>({...value,manualDeltaTenths:value.manualDeltaTenths-5}))}>−</button><span><small>Voto</small><b>{formatRating(technical)}</b></span><button disabled={locked||technical>=10} onClick={()=>update(player.id,teamId,value=>({...value,manualDeltaTenths:value.manualDeltaTenths+5}))}>+</button></div><div className="rating-bonuses"><select value="" disabled={locked} aria-label={`Bonus e malus di ${player.firstName} ${player.lastName}`} onChange={e=>{const modifier=e.target.value;if(modifier)update(player.id,teamId,value=>({...value,modifiers:[...value.modifiers,modifier]}))}}><option value="">+ Bonus / malus</option>{ratingModifiers.filter(option=>!["clean_sheet","saved_penalty","conceded_goal"].includes(option.id)||isKeeper).map(option=><option key={option.id} value={option.id} disabled={option.id==="mvp"&&Boolean(mvpPlayer&&mvpPlayer!==player.id)}>{option.label} {option.value>0?"+":""}{String(option.value).replace(".",",")}</option>)}</select><div>{row.modifiers.map((modifier,index)=>{const option=ratingModifiers.find(item=>item.id===modifier);return option?<button type="button" disabled={locked} key={`${modifier}-${index}`} onClick={()=>update(player.id,teamId,value=>({...value,modifiers:value.modifiers.filter((_,i)=>i!==index)}))}>{option.label} <b>{option.value>0?"+":""}{String(option.value).replace(".",",")}</b><X/></button>:null})}</div></div><strong className="final-rating"><small>Totale</small>{formatRating(total)}</strong></article>})}</section>)}</div>:<div className="events-empty"><UsersRound/><b>Nessun giocatore confermato</b><span>Prima indica titolari e presenti nella distinta finale.</span></div>}{!locked&&players.length>0&&<footer><span>{players.length} valutazioni · modifiche sempre rettificabili dal Direttore</span><button className="gold-button" disabled={saving} onClick={onSave}><Save/> Salva tabellino</button></footer>}</section>
}

function MatchAttendanceEditor({match,homePlayers,awayPlayers,calledIds,statuses,setStatuses,locked,saving,onSave}:{match:any;homePlayers:Player[];awayPlayers:Player[];calledIds:string[];statuses:Record<string,string>;setStatuses:(value:Record<string,string>)=>void;locked:boolean;saving:boolean;onSave:()=>void}){
  const players=[...homePlayers.map(player=>({...player,teamId:match.homeTeamId,teamName:match.home})),...awayPlayers.map(player=>({...player,teamId:match.awayTeamId,teamName:match.away}))].filter(player=>calledIds.includes(player.id));
  const present=players.filter(player=>["starter","present"].includes(statuses[player.id])).length;
  return <section className="attendance-editor"><header><div><p className="eyebrow">Distinta finale</p><h3>Presenze effettive</h3><span>{present} presenti · {players.length-present} da confermare o assenti</span></div>{!locked&&players.length>0&&<button className="ghost-button" onClick={()=>setStatuses(Object.fromEntries(players.map(player=>[player.id,"present"]))) }><Check/> Tutti presenti</button>}</header>{players.length?<div className="attendance-grid">{players.map(player=><label key={player.id}><span className="preview-player-photo">{player.photoKey?<img src={mediaUrl(player.photoKey)} alt=""/>:player.shirtNumber??"—"}</span><b>{player.firstName} {player.lastName}<small>{player.teamName}</small></b><select value={statuses[player.id]||"called"} disabled={locked} onChange={e=>setStatuses({...statuses,[player.id]:e.target.value})}><option value="called">Da confermare</option><option value="starter">Titolare</option><option value="present">Entrato/presente</option><option value="absent">Assente</option></select></label>)}</div>:<div className="events-empty"><UsersRound/><b>Nessuna distinta disponibile</b><span>Prima salva i convocati delle due società.</span></div>}{!locked&&players.length>0&&<footer><span>Solo titolari e presenti generano una presenza statistica.</span><button className="gold-button" disabled={saving||players.some(player=>!['starter','present','absent'].includes(statuses[player.id]))} onClick={onSave}><Save/> Conferma presenze</button></footer>}</section>
}

function OperationalMatchDrawer({
  matchId,
  onClose,
  onChanged,
  notify,
}: {
  matchId: string;
  onClose: () => void;
  onChanged?: () => Promise<void>;
  notify?: (v: string) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [homePenaltyScore,setHomePenaltyScore]=useState<number|string>("");
  const [awayPenaltyScore,setAwayPenaltyScore]=useState<number|string>("");
  const [notes, setNotes] = useState("");
  const [homeCalled, setHomeCalled] = useState<string[]>([]);
  const [awayCalled, setAwayCalled] = useState<string[]>([]);
  const [ticket, setTicket] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(true);
  const [startsAt, setStartsAt] = useState("");
  const [venue, setVenue] = useState("");
  const [field, setField] = useState("");
  const [refereeName, setRefereeName] = useState("");
  const [matchDay, setMatchDay] = useState(1);
  const [matchStatus, setMatchStatus] = useState("scheduled");
  const [scheduledHomeTeamId,setScheduledHomeTeamId]=useState("");
  const [scheduledAwayTeamId,setScheduledAwayTeamId]=useState("");
  const [ratings,setRatings]=useState<MatchPlayerRating[]>([]);
  const [events,setEvents]=useState<MatchEvent[]>([]);
  const [attendance, setAttendance] = useState<Record<string,string>>({});
  const [sheetMode,setSheetMode]=useState<"template"|"match">("match");
  const [selectedPlayer, setSelectedPlayer] = useState<{playerId:string;teamId:string}|null>(null);
  const [awardType,setAwardType]=useState("top_goal");
  const [awardPlayerId,setAwardPlayerId]=useState("");
  const [awardNote,setAwardNote]=useState("");
  function prepareDemoSimulation(){
    if(!data)return;
    const home=(data.homePlayers as Player[]).filter(player=>["starter","present"].includes(attendance[player.id]));
    const away=(data.awayPlayers as Player[]).filter(player=>["starter","present"].includes(attendance[player.id]));
    const rows:MatchPlayerRating[]=[...home.map(player=>({playerId:player.id,teamId:data.match.homeTeamId,baseRatingTenths:60,manualDeltaTenths:0,modifiers:[],finalRatingTenths:60})),...away.map(player=>({playerId:player.id,teamId:data.match.awayTeamId,baseRatingTenths:60,manualDeltaTenths:0,modifiers:[],finalRatingTenths:60}))];
    const add=(players:Player[],shirt:number,modifier:string,delta=0)=>{const player=players.find(value=>Number(value.shirtNumber)===shirt);if(!player)return;const row=rows.find(value=>value.playerId===player.id);if(!row)return;row.manualDeltaTenths+=delta;row.modifiers.push(modifier);row.finalRatingTenths=Math.round((6+row.manualDeltaTenths/10+ratingValue(row.modifiers))*10)};
    add(home,9,"goal");add(home,9,"mvp");add(home,7,"goal");add(home,10,"assist",5);add(home,8,"assist");
    add(away,9,"goal");add(away,10,"assist");add(away,1,"saved_penalty",5);
    setHomeScore(2);setAwayScore(1);setRatings(rows);setNotes("Simulazione demo caricata: controllare e modificare i dati prima del salvataggio.");
    notify?.("Simulazione caricata: 2–1, voti e bonus pronti ma non ancora salvati");
  }
  async function load() {
    const response = await fetch(`/api/matches/${matchId}`, {
      cache: "no-store",
    });
    const body = await response.json();
    if (response.ok) {
      setData(body);
      setHomeScore(body.report.homeScore || 0);
      setAwayScore(body.report.awayScore || 0);
      setHomePenaltyScore(body.report.homePenaltyScore??"");
      setAwayPenaltyScore(body.report.awayPenaltyScore??"");
      setNotes(body.report.directorNotes || body.report.refereeNotes || "");
      setStartsAt(body.match.startsAt.slice(0, 16));
      setVenue(body.match.venue || "");
      setField(body.match.field || "");
      setRefereeName(body.match.refereeName || "");
      setMatchDay(body.match.matchDay || 1);
      setMatchStatus(body.match.status || "scheduled");
      setScheduledHomeTeamId(body.match.homeTeamId);
      setScheduledAwayTeamId(body.match.awayTeamId);
      setEvents(body.events || []);
      if(body.playerRatings?.length)setRatings(body.playerRatings);
      else {
        const seeded=new Map<string,MatchPlayerRating>();
        const addModifier=(playerId:string|undefined,teamId:string,modifier:string)=>{if(!playerId)return;const row=seeded.get(playerId)||{playerId,teamId,baseRatingTenths:60,manualDeltaTenths:0,modifiers:[],finalRatingTenths:60};row.modifiers.push(modifier);row.finalRatingTenths=Math.round((6+ratingValue(row.modifiers))*10);seeded.set(playerId,row)};
        (body.events||[]).forEach((event:MatchEvent)=>{addModifier(event.playerId,event.teamId,event.type);if(event.type==="goal")addModifier(event.assistPlayerId,event.teamId,"assist")});
        setRatings([...seeded.values()]);
      }
      setAttendance(Object.fromEntries((body.callups||[]).map((entry:any)=>[entry.playerId,entry.status])));
      setHomeCalled(
        body.callups
          .filter((v: any) => v.teamId === body.match.homeTeamId)
          .map((v: any) => v.playerId),
      );
      setAwayCalled(
        body.callups
          .filter((v: any) => v.teamId === body.match.awayTeamId)
          .map((v: any) => v.playerId),
      );
    }
  }
  useEffect(() => {
    void load();
  }, [matchId]);
  async function send(payload: any, message: string) {
    setSaving(true);
    const response = await fetch(`/api/matches/${matchId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    setSaving(false);
    if (!response.ok) {
      notify?.(body.error || "Operazione non riuscita");
      return;
    }
    await load();
    await onChanged?.();
    notify?.(message);
  }
  if (!data)
    return (
      <div className="drawer-layer">
        <aside className="match-drawer">
          <div className="workspace-loading">Caricamento partita…</div>
        </aside>
      </div>
    );
  const m = data.match;
  const isKnockout=["finals","knockout"].includes(m.stage);
  const canSubmitReport = [
    "SUPER_ADMIN",
    "TOURNAMENT_DIRECTOR",
    "REFEREE",
  ].includes(data.viewerRole);
  const canOfficialize = ["SUPER_ADMIN", "TOURNAMENT_DIRECTOR"].includes(
    data.viewerRole,
  );
  const canManageSchedule = canOfficialize;
  const refereeLocked =
    data.viewerRole === "REFEREE" &&
    ["report_submitted", "official", "rectified"].includes(m.status);
  const canEditResult = canOfficialize || (canSubmitReport && !refereeLocked);
  const editableTeamIds: string[] = data.editableTeamIds || [];
  const awardPlayers=[...data.homePlayers,...data.awayPlayers].filter((player:Player)=>["starter","present"].includes(attendance[player.id]));
  const ratedPlayers=[...data.homePlayers.map((player:Player)=>({...player,teamId:m.homeTeamId,teamName:m.home})),...data.awayPlayers.map((player:Player)=>({...player,teamId:m.awayTeamId,teamName:m.away}))].map((player:Player&{teamId:string;teamName:string})=>{const row=ratings.find(value=>value.playerId===player.id);return row?{...player,...row}:null}).filter(Boolean).sort((a:any,b:any)=>b.finalRatingTenths-a.finalRatingTenths) as Array<Player&MatchPlayerRating&{teamName:string}>;
  const draftMvp=ratedPlayers[0];
  const derivedHomeScore=ratings.reduce((total,row)=>total+row.modifiers.filter(modifier=>(modifier==="goal"&&row.teamId===m.homeTeamId)||(modifier==="own_goal"&&row.teamId===m.awayTeamId)).length,0);
  const derivedAwayScore=ratings.reduce((total,row)=>total+row.modifiers.filter(modifier=>(modifier==="goal"&&row.teamId===m.awayTeamId)||(modifier==="own_goal"&&row.teamId===m.homeTeamId)).length,0);
  const homePresentCount=homeCalled.filter(playerId=>["starter","present"].includes(attendance[playerId])).length;
  const awayPresentCount=awayCalled.filter(playerId=>["starter","present"].includes(attendance[playerId])).length;
  const pendingAttendance=[...homeCalled,...awayCalled].filter(playerId=>!["starter","present","absent"].includes(attendance[playerId])).length;
  const matchReady=homeCalled.length>0&&awayCalled.length>0&&homePresentCount>0&&awayPresentCount>0&&pendingAttendance===0;
  const readinessMessage=!homeCalled.length||!awayCalled.length?"Completa le distinte di entrambe le squadre":!homePresentCount||!awayPresentCount?"Conferma almeno un presente per ogni squadra":pendingAttendance>0?`Conferma ancora ${pendingAttendance} giocator${pendingAttendance===1?"e":"i"}`:"Tabellino pronto per la pubblicazione";
  async function saveUnifiedSheet(mode:"template"|"match",options:{quiet?:boolean;refresh?:boolean}={}){
    setSaving(true);
    const post=async(payload:any)=>{const response=await fetch(`/api/matches/${matchId}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)}),body=await response.json();if(!response.ok)throw new Error(body.error||"Operazione non riuscita")};
    try{
      if(mode==="template"){
        if(editableTeamIds.includes(m.homeTeamId))await post({action:"save_callups",teamId:m.homeTeamId,playerIds:homeCalled});
        if(editableTeamIds.includes(m.awayTeamId))await post({action:"save_callups",teamId:m.awayTeamId,playerIds:awayCalled});
      }else{
        const calledIds=[...homeCalled,...awayCalled];
        const confirmedEntries=calledIds.filter(playerId=>["starter","present","absent"].includes(attendance[playerId])).map(playerId=>({playerId,status:["starter","present"].includes(attendance[playerId])?"present":"absent"}));
        await post({action:"save_attendance",entries:confirmedEntries});
        const allPlayers=[...data.homePlayers,...data.awayPlayers] as Player[];
        await post({action:"save_match_ratings",entries:allPlayers.filter(player=>["starter","present"].includes(attendance[player.id])).map(player=>ratings.find(row=>row.playerId===player.id)||{playerId:player.id,manualDeltaTenths:0,modifiers:[]})});
      }
      if(options.refresh!==false){await load();await onChanged?.()}
      if(!options.quiet)notify?.(mode==="template"?"Distinta unica salvata":"Tabellino completo salvato: presenze, voti e bonus aggiornati");
      return true;
    }catch(error){notify?.(error instanceof Error?error.message:"Operazione non riuscita");return false}finally{setSaving(false)}
  }
  async function finalizeMatch(){
    if(!matchReady){notify?.(readinessMessage);return}
    const saved=await saveUnifiedSheet("match",{quiet:true,refresh:false});
    if(!saved)return;
    const action=canOfficialize?"officialize":"submit_report";
    await send({action,homeScore:derivedHomeScore,awayScore:derivedAwayScore,homePenaltyScore,awayPenaltyScore,notes},["official","rectified"].includes(m.status)?"Risultato rettificato: classifiche e statistiche ricalcolate":"Gara chiusa: risultato, classifica e statistiche pubblicati");
  }
  return (
    <div
      className="drawer-layer"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="operational-drawer">
        <header>
          <div>
            <p className="eyebrow">
              {m.tournamentName} · {m.tournamentEdition} · {m.competitionName||"Campionato"} · {m.roundName||`Giornata ${m.matchDay}`} · {m.category} {m.division}
            </p>
            <h2>Centro partita</h2>
          </div>
          <div className="match-header-actions">{canOfficialize&&!ratings.length&&<button className="ghost-button" onClick={prepareDemoSimulation}><Sparkles/> Simula 2–1</button>}<button className="icon-button" onClick={onClose}><X /></button></div>
        </header>
        <section className="match-preview-head">
          <div><CalendarDays/><span><small>Data e ora</small><b>{new Date(m.startsAt).toLocaleDateString("it-IT",{weekday:"long",day:"2-digit",month:"long"})} · {new Date(m.startsAt).toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})}</b></span></div>
          <div><MapPin/><span><small>Impianto</small><b>{m.venue} · {m.field}</b></span></div>
          <div><Flag/><span><small>Arbitro</small><b>{m.refereeName||"Da assegnare"}</b></span></div>
          <div><UsersRound/><span><small>Distinte</small><b>{homeCalled.length + awayCalled.length} convocati totali</b></span></div>
        </section>
        {canManageSchedule && <section className="schedule-editor">
          <header><div><p className="eyebrow">Programmazione</p><h3>Data, campo e stato gara</h3></div><button className="ghost-button" onClick={()=>setEditingSchedule(!editingSchedule)}><Edit3/> {editingSchedule?"Chiudi":"Modifica gara"}</button></header>
          {editingSchedule && <><div className="schedule-grid">
            {isKnockout&&<><label><span>Squadra casa</span><select value={scheduledHomeTeamId} onChange={e=>setScheduledHomeTeamId(e.target.value)}>{(data.competitionTeams||[]).map((team:any)=><option key={team.id} value={team.id} disabled={team.id===scheduledAwayTeamId}>{team.name}</option>)}</select></label><label><span>Squadra ospite</span><select value={scheduledAwayTeamId} onChange={e=>setScheduledAwayTeamId(e.target.value)}>{(data.competitionTeams||[]).map((team:any)=><option key={team.id} value={team.id} disabled={team.id===scheduledHomeTeamId}>{team.name}</option>)}</select></label></>}
            <label><span>Data e ora</span><input type="datetime-local" value={startsAt} onChange={e=>setStartsAt(e.target.value)}/></label>
            <label><span>Giornata</span><input type="number" min="1" value={matchDay} onChange={e=>setMatchDay(Number(e.target.value))}/></label>
            <label className="full"><span>Sede e campo</span><select value={`${venue}|${field}`} onChange={e=>{const selected=(data.fields||[]).find((item:TournamentField)=>`${item.venueName}|${item.fieldName}`===e.target.value);setVenue(selected?.venueName||venue);setField(selected?.fieldName||field)}}><option value={`${venue}|${field}`}>{venue} · {field}</option>{(data.fields||[]).filter((item:TournamentField)=>`${item.venueName}|${item.fieldName}`!==`${venue}|${field}`).map((item:TournamentField)=><option key={item.id||`${item.venueName}-${item.fieldName}`} value={`${item.venueName}|${item.fieldName}`}>{item.venueName} · {item.fieldName}{item.fieldNumber?` (${item.fieldNumber})`:""}</option>)}</select></label>
            <label><span>Arbitro</span><input list={`referees-${matchId}`} value={refereeName} onChange={e=>setRefereeName(e.target.value)} placeholder="Da assegnare"/><datalist id={`referees-${matchId}`}>{data.referees.map((referee:RefereeOption)=><option key={referee.email} value={referee.name}/>)}</datalist></label>
            <label><span>Stato</span><select value={matchStatus} onChange={e=>setMatchStatus(e.target.value)}><option value="scheduled">Programmata</option><option value="confirmed">Confermata</option><option value="live">In corso</option><option value="played">Terminata</option><option value="report_submitted">Referto inviato</option><option value="official">Ufficiale</option><option value="rectified">Rettificata</option><option value="postponed">Rinviata</option><option value="recovery">Recupero</option><option value="cancelled">Annullata</option><option value="reviewing">In verifica</option></select></label>
          </div><div className="schedule-note"><ShieldCheck/> Il sistema impedisce campi o arbitri sovrapposti e il doppio impegno della stessa squadra nel weekend. Cambiare un accoppiamento azzera convocati e tabellino già preparati.</div><button className="gold-button" disabled={saving||scheduledHomeTeamId===scheduledAwayTeamId} onClick={()=>void send({action:"update_match",homeTeamId:scheduledHomeTeamId,awayTeamId:scheduledAwayTeamId,startsAt:scheduleIso(startsAt),venue,field,refereeName,matchDay,status:matchStatus},"Programmazione partita aggiornata")}><Save/> Salva programmazione</button></>}
        </section>}
        <UnifiedMatchSheet match={m} homePlayers={data.homePlayers} awayPlayers={data.awayPlayers} homeCalled={homeCalled} setHomeCalled={setHomeCalled} awayCalled={awayCalled} setAwayCalled={setAwayCalled} statuses={attendance} setStatuses={setAttendance} ratings={ratings} setRatings={setRatings} awards={data.matchAwards} editableTeamIds={editableTeamIds} canEditMatch={canEditResult} mode={sheetMode} setMode={setSheetMode} saving={saving} onSave={mode=>void saveUnifiedSheet(mode)} onPlayer={(player,teamId)=>setSelectedPlayer({playerId:player.id,teamId})}/>
        <section className="match-awards-editor">
          <header><div><p className="eyebrow">Premi partita</p><h3>Assegna un riconoscimento</h3><span>Solo ai giocatori confermati presenti nella distinta.</span></div><Medal/></header>
          {canOfficialize&&<div className="match-awards-form"><label><span>Premio</span><select value={awardType} onChange={e=>setAwardType(e.target.value)}><option value="top_goal">Top Goal</option><option value="top_save">Top Save</option><option value="fair_play">Fair Play</option><option value="best_defender">Miglior difensore</option><option value="rising_star">Rising Star</option><option value="special">Premio speciale</option></select></label><label><span>Giocatore</span><select value={awardPlayerId} onChange={e=>setAwardPlayerId(e.target.value)}><option value="">Seleziona…</option>{awardPlayers.map((player:Player)=><option key={player.id} value={player.id}>{player.firstName} {player.lastName} · #{player.shirtNumber||"—"}</option>)}</select></label><label className="full"><span>Motivazione facoltativa</span><input value={awardNote} onChange={e=>setAwardNote(e.target.value)} placeholder="Es. decisivo nei momenti chiave"/></label><button className="gold-button" disabled={saving||!awardPlayerId} onClick={()=>void send({action:"create_match_award",type:awardType,playerId:awardPlayerId,note:awardNote},"Premio assegnato e pubblicato").then(()=>{setAwardPlayerId("");setAwardNote("")})}><Medal/> Assegna premio</button></div>}
          {data.matchAwards?.some((award:AwardEntry)=>!award.type.startsWith("badge_"))?<div className="match-awards-list">{data.matchAwards.filter((award:AwardEntry)=>!award.type.startsWith("badge_")).map((award:AwardEntry)=><span key={award.id}><AwardBadge compact type={award.type}/><b>{award.title}</b> {award.recipientName}</span>)}</div>:<p className="muted-copy">Nessun premio speciale ancora assegnato.</p>}
          {data.matchAwards?.some((award:AwardEntry)=>award.type.startsWith("badge_"))&&<div className="unlocked-badges"><small>SBLOCCATI DA QUESTA GARA</small><div>{data.matchAwards.filter((award:AwardEntry)=>award.type.startsWith("badge_")).map((award:AwardEntry)=><span key={award.id}><AwardBadge type={award.type}/><b>{award.recipientName}<small>{award.title}</small></b></span>)}</div></div>}
        </section>
        {data.finance?.length>0&&<section className="match-finance-strip"><header><div><p className="eyebrow">Quota convocati</p><h3>Situazione economica della gara</h3></div><CircleDollarSign/></header><div>{[[m.homeTeamId,m.home],[m.awayTeamId,m.away]].map(([teamId,teamName])=>{const row=data.finance.find((value:any)=>value.teamId===teamId);const due=Number(row?.dueCents||0),paid=Number(row?.paidCents||0);return <article key={teamId}><span><b>{teamName}</b><small>{Number(row?.callups||0)} quote generate</small></span><span><small>Dovuto</small><b>{euro(due)}</b></span><span><small>Pagato</small><b>{euro(paid)}</b></span><Status tone={paid>=due?"green":paid>0?"gold":"red"}>{paid>=due?"Saldato":paid>0?"Parziale":"Aperto"}</Status></article>})}</div></section>}
        {draftMvp&&<PostMatchStudio
          match={m}
          homeScore={derivedHomeScore}
          awayScore={derivedAwayScore}
          players={ratedPlayers}
          awards={data.matchAwards}
        />}
        <section className="result-console">
          <div>
            <ClubBadge initials={m.homeShort} color="red" />
            <b>{m.home}</b>
            <strong>{derivedHomeScore}</strong>
          </div>
          <span>—</span>
          <div>
            <strong>{derivedAwayScore}</strong>
            <b>{m.away}</b>
            <ClubBadge initials={m.awayShort} color="blue" />
          </div>
        </section>
        {isKnockout&&<section className="penalty-console"><header><div><p className="eyebrow">Spareggio</p><h3>Calci di rigore</h3></div><small>Compilare soltanto se la sfida termina in parità complessiva.</small></header><div><label><span>{m.home}</span><input type="number" min="0" disabled={!canEditResult} value={homePenaltyScore} onChange={e=>setHomePenaltyScore(e.target.value===""?"":Number(e.target.value))}/></label><b>—</b><label><span>{m.away}</span><input type="number" min="0" disabled={!canEditResult} value={awayPenaltyScore} onChange={e=>setAwayPenaltyScore(e.target.value===""?"":Number(e.target.value))}/></label></div></section>}
        <div className="result-status">
          <Status
            tone={
              m.status === "official" || m.status === "rectified"
                ? "green"
                : m.status === "report_submitted"
                  ? "blue"
                  : "gold"
            }
          >
            {matchStatusLabel[m.status] || m.status}
          </Status>
          <span>Risultato calcolato automaticamente dai bonus Gol e Autogol.</span>
        </div>
        <div className={`match-readiness ${matchReady?"is-ready":"is-blocked"}`}><span><Check/> {homePresentCount}/{homeCalled.length} presenti {m.home}</span><span><Check/> {awayPresentCount}/{awayCalled.length} presenti {m.away}</span><b>{readinessMessage}</b></div>
        <textarea
          className="report-notes"
          value={notes}
          disabled={!canEditResult}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Note gara facoltative o motivazione della rettifica…"
        />
        <div className="report-actions">
          {canSubmitReport && !canOfficialize && !refereeLocked && (
            <button
              className="gold-button"
              disabled={saving||!matchReady}
              onClick={() => void finalizeMatch()}
            >
              <ShieldCheck/> Chiudi gara e invia
            </button>
          )}
          {refereeLocked && (
            <span className="role-access-badge">Referto inviato · sola lettura</span>
          )}
          {canOfficialize && (
            <button
              className="gold-button"
              disabled={saving||!matchReady}
              onClick={() => void finalizeMatch()}
            >
              <ShieldCheck />{" "}
              {["official", "rectified"].includes(m.status)
                ? "Salva rettifica completa"
                : "Chiudi gara e pubblica"}
            </button>
          )}
        </div>
        <section className="match-history"><header><div><p className="eyebrow">Registro attività</p><h3>Storico della partita</h3></div><Clock3/></header>{data.history?.length?data.history.map((event:any)=><article key={event.id}><i/><div><b>{auditLabel[event.action]||event.action}</b><small>{event.actorName||event.actorRole} · {new Date(event.createdAt).toLocaleString("it-IT")}</small></div></article>):<p>Nessuna modifica registrata.</p>}</section>
        <section className="error-box">
          <header>
            <AlertTriangle />
            <div>
              <b>Segnala un errore</b>
              <small>
                La segnalazione apre una verifica e non modifica automaticamente
                risultato o classifica.
              </small>
            </div>
          </header>
          <textarea
            value={ticket}
            onChange={(e) => setTicket(e.target.value)}
            placeholder="Descrivi il dato da verificare…"
          />
          <button
            className="ghost-button"
            disabled={saving || ticket.length < 5}
            onClick={() =>
              void send(
                {
                  action: "report_error",
                  subject: "Errore dati partita",
                  description: ticket,
                },
                "Segnalazione registrata",
              )
            }
          >
            Invia segnalazione
          </button>
          {data.errors.map((error: any) => (
            <div className="ticket-row" key={error.id}>
              <Status tone="gold">{error.status}</Status>
              <span>{error.description}</span>
            </div>
          ))}
        </section>
      </aside>
      {selectedPlayer&&<TeamProfileDrawer teamId={selectedPlayer.teamId} initialPlayerId={selectedPlayer.playerId} onClose={()=>setSelectedPlayer(null)} notify={notify||(()=>undefined)}/>}
    </div>
  );
}
function CallupPicker({
  title,
  players,
  selected,
  setSelected,
  onSave,
}: {
  title: string;
  players: Player[];
  selected: string[];
  setSelected: (v: string[]) => void;
  onSave: () => void;
}) {
  return (
    <div>
      <header>
        <h3>{title}</h3>
        <span>{selected.length} convocati</span>
      </header>
      <div>
        {players.map((player) => {
          const active = selected.includes(player.id);
          return (
            <button
              className={active ? "selected" : ""}
              key={player.id}
              onClick={() =>
                setSelected(
                  active
                    ? selected.filter((id) => id !== player.id)
                    : [...selected, player.id],
                )
              }
            >
              <span>{player.shirtNumber ?? "—"}</span>
              <b>
                {player.firstName} {player.lastName}
              </b>
              <Check />
            </button>
          );
        })}
      </div>
      <button className="wide-button" onClick={onSave}>
        Salva convocati
      </button>
    </div>
  );
}

const outcomeLabels:Record<string,string>={champion:"Campione",finalist:"Finalista",promoted:"Promossa",safe:"Salva",relegated:"Retrocessa",repechaged:"Ripescata"};
function SeasonBadge({outcome}:{outcome:string}){return <span className={`season-badge season-badge--${outcome}`}>{outcome==="champion"?<Trophy/>:outcome==="promoted"?<ChevronRight/>:outcome==="relegated"?<ArrowLeft/>:<ShieldCheck/>}{outcomeLabels[outcome]||outcome}</span>}

function SeasonPanel({tournament,settings,teams,outcomes,saving,onAction}:{tournament:TournamentWorkspace["tournament"];settings:CompetitionSetting[];teams:TeamEntry[];outcomes:SeasonOutcome[];saving:boolean;onAction:(payload:unknown,message:string)=>void}){
  const [form,setForm]=useState({competitionId:settings[0]?.id||"",teamId:"",outcome:"repechaged",note:""});
  const selected=settings.find(row=>row.id===form.competitionId),eligible=teams.filter(team=>!selected||team.category===selected.category);
  const grouped=[...new Map(settings.filter(row=>row.id).map(row=>[row.id!,{setting:row,rows:outcomes.filter(item=>item.competitionId===row.id)}])).values()];
  return <div className="season-workspace"><section className="season-command"><div><p className="eyebrow">Regia fine stagione</p><h3>{tournament.status==="completed"?"Stagione chiusa e storicizzata":"Chiusura sportiva"}</h3><p>{tournament.status==="completed"?`Esiti ufficiali dal ${tournament.closedAt?new Date(tournament.closedAt).toLocaleDateString("it-IT"):"termine del torneo"}. Puoi correggere un esito o preparare la nuova edizione.`:"Controlla gare, finali e playout. La chiusura congela classifica, titoli e movimenti tra serie."}</p></div><div>{tournament.status==="completed"?<><button className="ghost-button" disabled={saving} onClick={()=>onAction({action:"reopen_season"},"Stagione riaperta: risultati e calendario sono di nuovo modificabili")}><LockKeyhole/> Riapri stagione</button><button className="gold-button" disabled={saving} onClick={()=>onAction({action:"create_next_season"},"Nuova stagione creata in bozza con squadre ricomposte")}><Plus/> Crea stagione successiva</button></>:<button className="gold-button" disabled={saving} onClick={()=>onAction({action:"close_season"},"Stagione chiusa: albo d’oro e movimenti sono ufficiali")}><ShieldCheck/> Chiudi stagione ufficialmente</button>}</div></section>
    <div className="season-groups">{grouped.map(({setting,rows})=><section key={setting.id} className="season-group"><header><div><b>{setting.name}</b><small>{setting.category} · {setting.division}</small></div><span>{rows.length?`${new Set(rows.map(row=>row.teamId)).size} squadre classificate`:"In attesa di chiusura"}</span></header>{rows.length?<div>{[...new Map(rows.map(row=>[row.teamId,row])).values()].map(team=><article key={team.teamId}><i>{team.shortName}</i><span><b>{team.teamName}</b><small>{team.position?`${team.position}° posto · `:""}{team.source==="manual"?"Correzione admin":team.source==="playout"?"Esito playout":"Calcolo automatico"}</small></span><div>{rows.filter(row=>row.teamId===team.teamId).map(row=><SeasonBadge key={row.id} outcome={row.outcome}/>)}</div></article>)}</div>:<div className="season-empty"><Trophy/><span><b>Nessun esito definitivo</b><small>Gli esiti appariranno alla chiusura della stagione.</small></span></div>}</section>)}</div>
    {tournament.status==="completed"&&<section className="season-override"><header><div><p className="eyebrow">Controllo amministrativo</p><h3>Correzione, ripescaggio o riconoscimento</h3></div><ShieldCheck/></header><div><label><span>Competizione</span><select value={form.competitionId} onChange={e=>setForm({...form,competitionId:e.target.value,teamId:""})}>{settings.filter(row=>row.id).map(row=><option key={row.id} value={row.id}>{row.name} · {row.category} {row.division}</option>)}</select></label><label><span>Squadra</span><select value={form.teamId} onChange={e=>setForm({...form,teamId:e.target.value})}><option value="">Seleziona</option>{eligible.map(team=><option key={team.id} value={team.id}>{team.clubName||team.name} · {team.squadName||team.category}</option>)}</select></label><label><span>Esito</span><select value={form.outcome} onChange={e=>setForm({...form,outcome:e.target.value})}>{Object.entries(outcomeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label><span>Motivazione</span><input value={form.note} onChange={e=>setForm({...form,note:e.target.value})} placeholder="Es. ripescaggio deliberato"/></label><button className="gold-button" disabled={saving||!form.teamId||!form.competitionId} onClick={()=>onAction({action:"override_outcome",...form},"Esito amministrativo registrato")}><Save/> Registra esito</button></div></section>}
  </div>
}

function StructurePanel({
  settings,
  teams,
  matches,
  fields,
  scheduleConfig,
  saving,
  onSave,
  onGenerateFinals,
  onAdvanceFinals,
  onGeneratePlayout,
  onAdvancePlayout,
  onOpenMatch,
}: {
  settings: CompetitionSetting[];
  teams: TeamEntry[];
  matches: MatchDetail[];
  fields: TournamentField[];
  scheduleConfig: ScheduleConfig;
  saving: boolean;
  onSave: (rows: CompetitionSetting[], fields: TournamentField[], scheduleConfig: ScheduleConfig) => void;
  onGenerateFinals: (competitionId:string) => void;
  onAdvanceFinals: (competitionId:string) => void;
  onGeneratePlayout: (competitionId:string) => void;
  onAdvancePlayout: (competitionId:string) => void;
  onOpenMatch: (match:MatchDetail) => void;
}) {
  const emptyFinals={mode:"none",qualifiers:0,semifinalLegs:1,finalLegs:1,thirdPlace:false,playoutEnabled:false,playoutTeams:4,promotions:0,relegations:0,promotionTargetDivision:"",relegationTargetDivision:""};
  const defaults:CompetitionSetting[] = [{name:"Campionato",kind:"league",category:"Categoria libera",division:"Girone unico",maxTeams:10,format:"Girone unico · sola andata",finals:"Nessuna fase finale",finalsConfig:emptyFinals,participantIds:[],enabled:true}];
  const normalizeConfig=(value:ScheduleConfig):ScheduleConfig=>({...value,matchFeeCents:Number.isFinite(Number(value.matchFeeCents))?Number(value.matchFeeCents):800,activeDays:Array.isArray(value.activeDays)?value.activeDays:JSON.parse(value.activeDays||"[6,0]")});
  const [rows, setRows] = useState<CompetitionSetting[]>(
    settings.length ? settings : defaults,
  );
  const [fieldRows,setFieldRows]=useState<TournamentField[]>(fields.length?fields:[{venueName:"Sede principale",address:"",fieldName:"Campo centrale",fieldNumber:"1",active:true}]);
  const [config,setConfig]=useState<ScheduleConfig>(normalizeConfig(scheduleConfig));
  useEffect(() => setRows(settings.length ? settings : defaults), [settings]);
  useEffect(()=>setFieldRows(fields.length?fields:[{venueName:"Sede principale",address:"",fieldName:"Campo centrale",fieldNumber:"1",active:true}]),[fields]);
  useEffect(()=>setConfig(normalizeConfig(scheduleConfig)),[scheduleConfig]);
  function addCompetition(){
    const clientKey=crypto.randomUUID();
    setRows(values=>[...values,{clientKey,name:"Nuova competizione",kind:"league",category:"Nuova categoria",division:"Nuovo girone",maxTeams:2,format:"Girone unico · sola andata",finals:"Nessuna fase finale",finalsConfig:emptyFinals,participantIds:[],enabled:true}]);
    requestAnimationFrame(()=>document.getElementById(`competition-${clientKey}`)?.scrollIntoView({behavior:"smooth",block:"center"}));
  }
  const days=[[1,"Lun"],[2,"Mar"],[3,"Mer"],[4,"Gio"],[5,"Ven"],[6,"Sab"],[0,"Dom"]] as const;
  return (
    <section className="structure-workspace">
    <div className="management-panel structure-panel">
      <header>
        <div>
          <p className="eyebrow">Configurazione libera</p>
          <h3>Struttura del torneo</h3>
        </div>
        <button
          className="gold-button"
          disabled={saving||rows.length===0||fieldRows.length===0||(config.activeDays as number[]).length===0||rows.some(row=>!row.category.trim()||!row.division.trim())||fieldRows.some(row=>!row.venueName.trim()||!row.fieldName.trim())}
          onClick={() => onSave(rows.map(row=>({...row,finals:row.kind==="league"?"Nessuna fase finale":`${row.finalsConfig.qualifiers} qualificate · semifinali ${row.finalsConfig.semifinalLegs===2?"andata/ritorno":"secche"} · finale ${row.finalsConfig.finalLegs===2?"andata/ritorno":"secca"}`})),fieldRows,config)}
        >
          <Save /> Salva tutte le impostazioni
        </button>
      </header>
      <div className="schedule-config-grid">
        <label><span>Inizio torneo</span><input type="date" value={config.startDate} onChange={e=>setConfig({...config,startDate:e.target.value})}/></label>
        <label><span>Fine torneo</span><input type="date" value={config.endDate} onChange={e=>setConfig({...config,endDate:e.target.value})}/></label>
        <label><span>Prima partita</span><input type="time" value={config.startTime} onChange={e=>setConfig({...config,startTime:e.target.value})}/></label>
        <label><span>Fine disponibilità</span><input type="time" value={config.endTime} onChange={e=>setConfig({...config,endTime:e.target.value})}/></label>
        <label><span>Durata partita</span><input type="number" min="5" max="180" value={config.matchMinutes} onChange={e=>setConfig({...config,matchMinutes:Number(e.target.value)})}/><small>minuti</small></label>
        <label><span>Spazio tra gare</span><input type="number" min="0" max="120" value={config.bufferMinutes} onChange={e=>setConfig({...config,bufferMinutes:Number(e.target.value)})}/><small>minuti</small></label>
        <label className="fee-setting"><span>Quota per convocato</span><input type="number" min="0" max="1000" step="0.50" value={(config.matchFeeCents/100).toFixed(2)} onChange={e=>setConfig({...config,matchFeeCents:Math.max(0,Math.round(Number(e.target.value)*100))})}/><small>€</small></label>
      </div>
      <div className="active-days"><b>Giorni utilizzabili</b>{days.map(([value,label])=><label key={value}><input type="checkbox" checked={(config.activeDays as number[]).includes(value)} onChange={e=>setConfig({...config,activeDays:e.target.checked?[...(config.activeDays as number[]),value]:(config.activeDays as number[]).filter(day=>day!==value)})}/><span>{label}</span></label>)}</div>
      <div className="subsection-head"><div><p className="eyebrow">Categorie, campionati e coppe</p><h4>Competizioni <small>{rows.length} configurate</small></h4></div><button type="button" className="ghost-button" onClick={addCompetition}><Plus/> Aggiungi competizione</button></div>
      <div className="structure-grid">
        {rows.map((row, index) => {
          const eligibleTeams=teams.filter(team=>team.category===row.category);
          const participantIds=row.participantIds||[];
          const count=participantIds.length;
          const bracketMatches=matches.filter(match=>match.competitionId===row.id&&["finals","placement"].includes(match.stage||""));
          const playoutMatches=matches.filter(match=>match.competitionId===row.id&&match.stage==="playout");
          return (
            <article
              className={!Boolean(row.enabled) ? "disabled" : ""}
              id={`competition-${row.clientKey||row.id||index}`}
              key={row.clientKey||row.id||`${row.category}-${row.division}-${index}`}
            >
              <header>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(row.enabled)}
                    onChange={(e) =>
                      setRows((values) =>
                        values.map((v, i) =>
                          i === index ? { ...v, enabled: e.target.checked } : v,
                        ),
                      )
                    }
                  />
                  <span>Attiva</span>
                </label>
                <button type="button" className="row-trash" onClick={()=>setRows(rows.filter((_,i)=>i!==index))} aria-label="Elimina competizione"><Trash2/></button>
              </header>
              <label className="structure-text"><span>Nome competizione</span><input value={row.name||"Campionato"} onChange={e=>setRows(values=>values.map((v,i)=>i===index?{...v,name:e.target.value}:v))} placeholder="Es. Campionato, Coppa Gold"/></label>
              <label className="structure-text"><span>Età o categoria</span><input value={row.category} onChange={e=>setRows(values=>values.map((v,i)=>i===index?{...v,category:e.target.value}:v))} placeholder="Es. 2014, Under 12, Open"/></label>
              <label className="structure-text"><span>Serie o girone</span><input value={row.division} onChange={e=>setRows(values=>values.map((v,i)=>i===index?{...v,division:e.target.value}:v))} placeholder="Es. Serie A, Girone Blu"/></label>
              <div className="competition-participants">
                <span>Squadre partecipanti</span>
                <small>La stessa squadra può partecipare anche a un'altra competizione.</small>
                <div>{eligibleTeams.length?eligibleTeams.map(team=><label key={team.id}><input type="checkbox" checked={participantIds.includes(team.id)} onChange={e=>setRows(values=>values.map((v,i)=>i===index?{...v,participantIds:e.target.checked?[...(v.participantIds||[]),team.id]:(v.participantIds||[]).filter(id=>id!==team.id)}:v))}/><span>{team.clubName||team.name} · {team.squadName||team.category}</span></label>):<p>Nessuna squadra della categoria {row.category}.</p>}</div>
              </div>
              <div>
                <span>
                  Squadre inserite <strong>{count}</strong>
                </span>
                <label>
                  Capienza{" "}
                  <input
                    type="number"
                    min="2"
                    max="200"
                    value={row.maxTeams}
                    onChange={(e) =>
                      setRows((values) =>
                        values.map((v, i) =>
                          i === index
                            ? { ...v, maxTeams: Number(e.target.value) }
                            : v,
                        ),
                      )
                    }
                  />
                </label>
              </div>
              <label className="structure-text"><span>Tipo competizione</span><select value={row.kind||"league"} onChange={e=>setRows(values=>values.map((v,i)=>i===index?{...v,kind:e.target.value as CompetitionSetting["kind"],finalsConfig:e.target.value==="league"?emptyFinals:{...(v.finalsConfig||emptyFinals),mode:"top",qualifiers:v.finalsConfig?.qualifiers||4}}:v))}><option value="league">Solo classifica</option><option value="league_knockout">Girone + fase finale</option><option value="knockout">Eliminazione diretta</option></select></label>
              {row.kind!=="knockout"&&<label className="structure-text"><span>Formula qualificazione</span><select value={row.format} onChange={e=>setRows(values=>values.map((v,i)=>i===index?{...v,format:e.target.value}:v))}><option>Girone unico · sola andata</option><option>Girone unico · andata e ritorno</option></select></label>}
              {row.kind!=="league"&&<div className="finals-config"><label><span>Qualificate</span><select value={row.finalsConfig?.qualifiers||4} onChange={e=>setRows(values=>values.map((v,i)=>i===index?{...v,finalsConfig:{...(v.finalsConfig||emptyFinals),qualifiers:Number(e.target.value)}}:v))}><option value="2">2</option><option value="4">4</option><option value="8">8</option><option value="16">16</option></select></label><label><span>Semifinali</span><select value={row.finalsConfig?.semifinalLegs||1} onChange={e=>setRows(values=>values.map((v,i)=>i===index?{...v,finalsConfig:{...(v.finalsConfig||emptyFinals),semifinalLegs:Number(e.target.value)}}:v))}><option value="1">Gara secca</option><option value="2">Andata/ritorno</option></select></label><label><span>Finale</span><select value={row.finalsConfig?.finalLegs||1} onChange={e=>setRows(values=>values.map((v,i)=>i===index?{...v,finalsConfig:{...(v.finalsConfig||emptyFinals),finalLegs:Number(e.target.value)}}:v))}><option value="1">Gara secca</option><option value="2">Andata/ritorno</option></select></label><label className="finals-check"><input type="checkbox" checked={Boolean(row.finalsConfig?.thirdPlace)} onChange={e=>setRows(values=>values.map((v,i)=>i===index?{...v,finalsConfig:{...(v.finalsConfig||emptyFinals),thirdPlace:e.target.checked}}:v))}/><span>Finale 3° posto</span></label></div>}
              {row.kind!=="knockout"&&<div className="season-config"><header><b>Movimenti tra serie</b><small>Regole applicate alla chiusura ufficiale</small></header><div><label><span>Promosse</span><input type="number" min="0" max="20" value={row.finalsConfig?.promotions||0} onChange={e=>setRows(values=>values.map((v,i)=>i===index?{...v,finalsConfig:{...(v.finalsConfig||emptyFinals),promotions:Math.max(0,Number(e.target.value))}}:v))}/></label><label><span>Verso la serie</span><input value={row.finalsConfig?.promotionTargetDivision||""} placeholder="Es. Serie A" onChange={e=>setRows(values=>values.map((v,i)=>i===index?{...v,finalsConfig:{...(v.finalsConfig||emptyFinals),promotionTargetDivision:e.target.value}}:v))}/></label><label><span>Retrocesse</span><input type="number" min="0" max="20" value={row.finalsConfig?.relegations||0} onChange={e=>setRows(values=>values.map((v,i)=>i===index?{...v,finalsConfig:{...(v.finalsConfig||emptyFinals),relegations:Math.max(0,Number(e.target.value))}}:v))}/></label><label><span>Verso la serie</span><input value={row.finalsConfig?.relegationTargetDivision||""} placeholder="Es. Serie B" onChange={e=>setRows(values=>values.map((v,i)=>i===index?{...v,finalsConfig:{...(v.finalsConfig||emptyFinals),relegationTargetDivision:e.target.value}}:v))}/></label></div><label className="playout-toggle"><input type="checkbox" checked={Boolean(row.finalsConfig?.playoutEnabled)} onChange={e=>setRows(values=>values.map((v,i)=>i===index?{...v,finalsConfig:{...(v.finalsConfig||emptyFinals),playoutEnabled:e.target.checked}}:v))}/><span><b>Playout salvezza</b><small>Le perdenti avanzano; chi perde la finale retrocede.</small></span></label>{row.finalsConfig?.playoutEnabled&&<label><span>Squadre nei playout</span><select value={row.finalsConfig?.playoutTeams||4} onChange={e=>setRows(values=>values.map((v,i)=>i===index?{...v,finalsConfig:{...(v.finalsConfig||emptyFinals),playoutTeams:Number(e.target.value)}}:v))}><option value="2">Ultime 2</option><option value="4">Ultime 4</option><option value="8">Ultime 8</option></select></label>}</div>}
              {row.kind!=="league"&&row.id&&!bracketMatches.length&&<button type="button" className="competition-generate" disabled={saving||count<2} onClick={()=>onGenerateFinals(row.id!)}><WandSparkles/> Genera primo turno finale</button>}
              {row.kind!=="league"&&row.id&&bracketMatches.length>0&&<button type="button" className="competition-generate" disabled={saving} onClick={()=>onAdvanceFinals(row.id!)}><ChevronRight/> Calcola e genera turno successivo</button>}
              {row.kind!=="league"&&!row.id&&<small>Salva la struttura per attivare la generazione della fase finale.</small>}
              {row.kind!=="knockout"&&row.finalsConfig?.playoutEnabled&&row.id&&!playoutMatches.length&&<button type="button" className="competition-generate playout" disabled={saving||count<2} onClick={()=>onGeneratePlayout(row.id!)}><ShieldCheck/> Genera tabellone playout</button>}
              {row.kind!=="knockout"&&row.finalsConfig?.playoutEnabled&&row.id&&playoutMatches.length>0&&<button type="button" className="competition-generate playout" disabled={saving} onClick={()=>onAdvancePlayout(row.id!)}><ChevronRight/> Calcola turno playout</button>}
            </article>
          );
        })}
      </div>
      {rows.some(row=>row.kind!=="league"||row.finalsConfig?.playoutEnabled)&&<div className="bracket-board"><div className="subsection-head"><div><p className="eyebrow">Fasi decisive</p><h4>Playoff e playout</h4></div></div>{rows.filter(row=>row.id&&(row.kind!=="league"||row.finalsConfig?.playoutEnabled)).map(row=>{const competitionMatches=matches.filter(match=>match.competitionId===row.id&&["finals","placement","playout"].includes(match.stage||"")),rounds=[...new Set(competitionMatches.map(match=>`${match.stage}:${match.bracketRound||1}`))];return <section key={row.id} className="competition-bracket"><header><div><b>{row.name}</b><small>{row.category} · {row.division}</small></div><Status tone={competitionMatches.length?"blue":"gold"}>{competitionMatches.length?"In corso":"Da generare"}</Status></header>{competitionMatches.length?<div className="bracket-rounds">{rounds.map(key=>{const [stage,roundText]=key.split(":"),round=Number(roundText),stageMatches=competitionMatches.filter(match=>match.stage===stage&&(match.bracketRound||1)===round);return <div className={`bracket-round ${stage==="playout"?"bracket-round--playout":""}`} key={key}><h5>{stage==="playout"?"PLAYOUT · ":""}{stageMatches[0]?.roundName?.replace(/ · (andata|ritorno)$/i,"")||`Turno ${round}`}</h5>{[...new Set(stageMatches.map(match=>match.bracketTieId||match.id))].map(tie=><article key={tie}>{stageMatches.filter(match=>(match.bracketTieId||match.id)===tie).map(match=><button key={match.id} onClick={()=>onOpenMatch(match)}><span><b>{match.home}</b><em>{["official","rectified"].includes(match.status)?match.homeScore??0:"–"}</em></span><span><b>{match.away}</b><em>{["official","rectified"].includes(match.status)?match.awayScore??0:"–"}</em></span><small>{match.stage==="playout"?"Sfida salvezza":match.stage==="placement"?"3° posto":matchStatusLabel[match.status]||match.status}</small></button>)}</article>)}</div>})}</div>:<div className="bracket-empty"><Trophy/><span><b>Tabelloni non ancora generati</b><small>Salva la formula, poi avvia la fase prevista.</small></span></div>}</section>})}</div>}
      <div className="subsection-head"><div><p className="eyebrow">Anagrafica impianti</p><h4>Sedi e campi</h4></div><button className="ghost-button" onClick={()=>setFieldRows([...fieldRows,{venueName:"",address:"",fieldName:"",fieldNumber:"",active:true}])}><Plus/> Aggiungi campo</button></div>
      <div className="field-registry">{fieldRows.map((row,index)=><article key={row.id||index} className={!Boolean(row.active)?"disabled":""}><header><label><input type="checkbox" checked={Boolean(row.active)} onChange={e=>setFieldRows(values=>values.map((v,i)=>i===index?{...v,active:e.target.checked}:v))}/><span>Disponibile</span></label><button className="row-trash" onClick={()=>setFieldRows(fieldRows.filter((_,i)=>i!==index))}><Trash2/></button></header><div><label><span>Nome sede</span><input value={row.venueName} onChange={e=>setFieldRows(values=>values.map((v,i)=>i===index?{...v,venueName:e.target.value}:v))} placeholder="Es. Centro Sportivo Aurora"/></label><label><span>Indirizzo</span><input value={row.address||""} onChange={e=>setFieldRows(values=>values.map((v,i)=>i===index?{...v,address:e.target.value}:v))} placeholder="Via e città"/></label><label><span>Nome campo</span><input value={row.fieldName} onChange={e=>setFieldRows(values=>values.map((v,i)=>i===index?{...v,fieldName:e.target.value}:v))} placeholder="Es. Arena Blu"/></label><label><span>Numero/codice</span><input value={row.fieldNumber||""} onChange={e=>setFieldRows(values=>values.map((v,i)=>i===index?{...v,fieldNumber:e.target.value}:v))} placeholder="Es. A, 7, Nord"/></label></div></article>)}</div>
      <footer className="structure-note">
        <ShieldCheck />
        <span>
          <b>Regole calendario applicate</b>
          <small>
            {fieldRows.filter(field=>Boolean(field.active)).length} campi · {config.startTime}–{config.endTime} · {config.matchMinutes} minuti + {config.bufferMinutes} di intervallo · quota € {(config.matchFeeCents/100).toFixed(2)} per convocato. Le quote già generate conservano il valore storico.
          </small>
        </span>
      </footer>
    </div></section>
  );
}

function isVideoMedia(value?:string){return Boolean(value&&/\.(mp4|webm|mov)$/i.test(value))}
function MediaUploader({entityType,entityId,slot,label,value,onDone,accept="image/*"}:{entityType:"team"|"player"|"tournament";entityId:string;slot:string;label:string;value?:string;onDone:(key:string)=>void;accept?:string}) {
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  async function upload(file?:File){
    if(!file)return;
    setLoading(true);setError("");
    const form=new FormData();form.set("file",file);form.set("entityType",entityType);form.set("entityId",entityId);form.set("slot",slot);
    const response=await fetch("/api/media",{method:"POST",body:form});
    const body=await response.json();setLoading(false);
    if(response.ok)onDone(body.key);else setError(body.error||"Caricamento non riuscito");
  }
  return <label className={`media-uploader ${value?"has-media":""}`}>
    {value&&isVideoMedia(value)?<video src={mediaUrl(value)} controls preload="metadata"/>:value?<img src={mediaUrl(value)} alt=""/>:<span><UploadCloud/><b>{loading?"Caricamento…":label}</b><small>{accept.includes("video")?"Foto fino a 8 MB · video fino a 100 MB":"JPG, PNG o WebP"}</small>{error&&<em className="upload-error">{error}</em>}</span>}
    {value&&<em><Camera/> Sostituisci</em>}
    <input type="file" accept={accept} disabled={loading} onChange={e=>void upload(e.target.files?.[0])}/>
  </label>
}

function PlayerProfilePanel({player,team,stats,milestones,awards,tournaments,onClose,onAction,notify}:{player:Player;team:TeamProfile;stats:PlayerStat[];milestones:PlayerMilestone[];awards:PlayerAward[];tournaments:TeamTournament[];onClose:()=>void;onAction:(payload:unknown,message:string)=>Promise<void>;notify:(message:string)=>void}){
  const [profile,setProfile]=useState({publicName:player.publicName||`${player.firstName} ${player.lastName.charAt(0)}.`,bio:player.bio||"",preferredFoot:player.preferredFoot||"",profileVisibility:player.profileVisibility||"private",mediaConsent:Boolean(player.mediaConsent)});
  const current=stats[0];
  const visibleAwards=awards;
  const [stat,setStat]=useState({tournamentId:current?.tournamentId||tournaments[0]?.id||"",appearances:current?.appearances||0,goals:current?.goals||0,assists:current?.assists||0,cleanSheets:current?.cleanSheets||0,mvpAwards:current?.mvpAwards||0,yellowCards:current?.yellowCards||0,redCards:current?.redCards||0,minutesPlayed:current?.minutesPlayed||0});
  const [milestone,setMilestone]=useState({type:"debut",title:"",description:"",happenedAt:new Date().toISOString().slice(0,10),tournamentId:tournaments[0]?.id||""});
  const futureId=`FSL-${player.birthYear}-${player.id.replaceAll("-","").slice(0,6).toUpperCase()}`;
  function share(){const url=`${window.location.origin}${window.location.pathname}?player=${player.id}`;void navigator.clipboard?.writeText(url);notify(profile.profileVisibility==="public"&&profile.mediaConsent?"Link player card copiato":"La card sarà condivisibile dopo consenso e pubblicazione")}
  return <div className="player-profile-layer"><section className="player-profile-panel"><header><div><p className="eyebrow">Future Stars ID · {futureId}</p><h2>{player.firstName} {player.lastName}</h2></div><button className="icon-button" onClick={onClose}><X/></button></header>
    <div className="player-card-preview" style={{"--club":team.primaryColor,"--club-2":team.secondaryColor} as React.CSSProperties}><div>{player.photoKey?<img src={mediaUrl(player.photoKey)} alt=""/>:<span>{player.shirtNumber??"FS"}</span>}<i>{team.crestKey?<img src={mediaUrl(team.crestKey)} alt=""/>:team.shortName}</i>{visibleAwards.length>0&&<div className="player-card-badges">{visibleAwards.slice(0,3).map(award=><AwardBadge key={award.id} type={award.type}/>)}</div>}</div><small>FUTURE STARS LEAGUE</small><h3>{profile.publicName||player.firstName}</h3><b>#{player.shirtNumber??"—"} · {player.role}</b><footer><span><strong>{current?.appearances||0}</strong> PRES</span><span><strong>{current?.goals||0}</strong> GOL</span><span><strong>{current?.assists||0}</strong> ASSIST</span><span><strong>{current?.mvpAwards||0}</strong> MVP</span></footer></div>
    {visibleAwards.length>0&&<section className="earned-badges"><header><div><p className="eyebrow">Badge conquistati</p><h3>Recognition wall</h3></div><Medal/></header><div>{visibleAwards.map(award=><article key={award.id}><AwardBadge type={award.type}/><span><b>{award.title}</b><small>{String(award.type).startsWith("badge_")?"Automatico · dati ufficiali":new Date(award.awardedAt).toLocaleDateString("it-IT")}{award.note?` · ${award.note}`:""}</small></span></article>)}</div></section>}
    <div className="player-profile-actions"><Status tone={profile.profileVisibility==="public"&&profile.mediaConsent?"green":"gold"}>{profile.profileVisibility==="public"&&profile.mediaConsent?"Card pubblica":"Card protetta"}</Status><button className="ghost-button" onClick={share}><Share2/> Condividi card</button></div>
    <section className="player-settings"><h3>Profilo e privacy</h3><div><label><span>Nome mostrato pubblicamente</span><input value={profile.publicName} onChange={e=>setProfile({...profile,publicName:e.target.value})}/></label><label><span>Piede preferito</span><select value={profile.preferredFoot} onChange={e=>setProfile({...profile,preferredFoot:e.target.value})}><option value="">Non indicato</option><option>Destro</option><option>Sinistro</option><option>Ambidestro</option></select></label><label className="full"><span>Presentazione atleta</span><textarea value={profile.bio} onChange={e=>setProfile({...profile,bio:e.target.value})}/></label><label><span>Visibilità</span><select value={profile.profileVisibility} onChange={e=>setProfile({...profile,profileVisibility:e.target.value})}><option value="private">Solo amministrazione</option><option value="team">Società e staff</option><option value="public">Pubblico</option></select></label><label className="consent-check"><input type="checkbox" checked={profile.mediaConsent} onChange={e=>setProfile({...profile,mediaConsent:e.target.checked})}/><span><b>Consenso media registrato</b><small>Necessario per foto e player card pubblica.</small></span></label></div><button className="gold-button" onClick={()=>void onAction({action:"update_player_profile",playerId:player.id,...profile},"Profilo atleta aggiornato")}><Save/> Salva profilo</button></section>
    <section className="player-stat-editor"><h3>Statistiche ufficiali</h3><div><label><span>Torneo</span><select value={stat.tournamentId} onChange={e=>setStat({...stat,tournamentId:e.target.value})}>{tournaments.map(t=><option value={t.id} key={t.id}>{t.name} · {t.edition}</option>)}</select></label>{[["Presenze","appearances"],["Gol","goals"],["Assist","assists"],["Clean sheet","cleanSheets"],["MVP","mvpAwards"],["Minuti","minutesPlayed"]].map(([label,key])=><label key={key}><span>{label}</span><input type="number" min="0" value={(stat as any)[key]} onChange={e=>setStat({...stat,[key]:Number(e.target.value)})}/></label>)}</div><button className="ghost-button" disabled={!stat.tournamentId} onClick={()=>void onAction({action:"save_player_stats",playerId:player.id,...stat},"Statistiche aggiornate")}><BarChart3/> Aggiorna numeri</button></section>
    <section className="player-history"><header><div><p className="eyebrow">Carriera Future Stars</p><h3>Timeline e palmarès</h3></div><Medal/></header><div className="history-columns"><div>{[...visibleAwards.map(a=>({id:a.id,title:a.title,description:a.note,happenedAt:a.awardedAt,type:"award"})),...milestones].sort((a,b)=>b.happenedAt.localeCompare(a.happenedAt)).map(item=><article key={item.id}><i>{item.type==="award"?<Trophy/>:<Sparkles/>}</i><span><small>{new Date(item.happenedAt).toLocaleDateString("it-IT")}</small><b>{item.title}</b><p>{item.description}</p></span></article>)}</div><div className="milestone-form"><input placeholder="Titolo traguardo" value={milestone.title} onChange={e=>setMilestone({...milestone,title:e.target.value})}/><textarea placeholder="Descrizione" value={milestone.description} onChange={e=>setMilestone({...milestone,description:e.target.value})}/><input type="date" value={milestone.happenedAt} onChange={e=>setMilestone({...milestone,happenedAt:e.target.value})}/><button className="ghost-button" disabled={milestone.title.length<3} onClick={()=>void onAction({action:"add_milestone",playerId:player.id,...milestone},"Traguardo aggiunto alla timeline")}><Plus/> Aggiungi traguardo</button></div></div></section>
  </section></div>
}

function TeamProfileDrawer({
  teamId,
  initialPlayerId,
  onClose,
  notify,
}: {
  teamId: string;
  initialPlayerId?: string;
  onClose: () => void;
  notify: (v: string) => void;
}) {
  const [activeTeamId,setActiveTeamId]=useState(teamId);
  const [team, setTeam] = useState<TeamProfile | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerStats,setPlayerStats]=useState<PlayerStat[]>([]);
  const [milestones,setMilestones]=useState<PlayerMilestone[]>([]);
  const [playerAwards,setPlayerAwards]=useState<PlayerAward[]>([]);
  const [teamTournaments,setTeamTournaments]=useState<TeamTournament[]>([]);
  const [squads,setSquads]=useState<ClubSquad[]>([]);
  const [selectedPlayerId,setSelectedPlayerId]=useState<string|null>(initialPlayerId||null);
  const [editing, setEditing] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [addingSquad,setAddingSquad]=useState(false);
  const [newSquad,setNewSquad]=useState({squadName:"",birthYear:"",coachName:""});
  const [saving, setSaving] = useState(false);
  const [player, setPlayer] = useState({
    firstName: "",
    lastName: "",
    birthYear: 2014,
    shirtNumber: "",
    role: "Giocatore",
  });
  async function load() {
    const response = await fetch(`/api/teams/${activeTeamId}`, { cache: "no-store" });
    const body = await response.json();
    if (response.ok) {
      setTeam({
        ...body.team,
        address: body.team.address || "",
        phone: body.team.phone || "",
        email: body.team.email || "",
        contactName: body.team.contactName || "",
        website: body.team.website || "",
        description: body.team.description || "",
        secondaryColor: body.team.secondaryColor || "#ffffff",
      });
      setPlayers(body.players);
      setPlayerStats(body.playerStats||[]);
      setMilestones(body.milestones||[]);
      setPlayerAwards(body.playerAwards||[]);
      setTeamTournaments(body.teamTournaments||[]);
      setSquads(body.squads||[]);
    }
  }
  useEffect(() => {
    void load();
  }, [activeTeamId]);
  async function save() {
    if (!team) return;
    setSaving(true);
    const response = await fetch(`/api/teams/${activeTeamId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(team),
    });
    const body = await response.json();
    setSaving(false);
    if (!response.ok) {
      notify(body.error || "Salvataggio non riuscito");
      return;
    }
    setEditing(false);
    notify("Scheda società aggiornata");
  }
  async function addPlayer() {
    setSaving(true);
    const response = await fetch(`/api/teams/${activeTeamId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "add_player", ...player }),
    });
    const body = await response.json();
    setSaving(false);
    if (!response.ok) {
      notify(body.error || "Giocatore non inserito");
      return;
    }
    setAddingPlayer(false);
    setPlayer({
      firstName: "",
      lastName: "",
      birthYear: 2014,
      shirtNumber: "",
      role: "Giocatore",
    });
    await load();
    notify("Giocatore aggiunto alla rosa");
  }
  async function playerAction(payload:unknown,message:string){
    setSaving(true);const response=await fetch(`/api/teams/${activeTeamId}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const body=await response.json();setSaving(false);if(!response.ok){notify(body.error||"Operazione non riuscita");return}await load();notify(message)
  }
  async function addSquad(){
    setSaving(true);const response=await fetch(`/api/teams/${activeTeamId}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"create_squad",...newSquad})});const body=await response.json();setSaving(false);if(!response.ok){notify(body.error||"Squadra non creata");return}setAddingSquad(false);setNewSquad({squadName:"",birthYear:"",coachName:""});await load();notify("Nuova squadra creata con una rosa separata")
  }
  return (
    <div
      className="drawer-layer"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="team-profile-drawer" role="dialog" aria-modal="true">
        <header>
          <div>
            <p className="eyebrow">
              Società → squadra → rosa separata
            </p>
            <h2>{team ? `${team.name} · ${team.squadName||"Squadra"}` : "Caricamento…"}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X />
          </button>
        </header>
        {team && (
          <>
            <section
              className="profile-hero"
              style={{ "--club": team.primaryColor,backgroundImage:team.coverKey?`linear-gradient(90deg,rgba(5,16,38,.92),rgba(5,16,38,.45)),url(${mediaUrl(team.coverKey)})`:undefined } as React.CSSProperties}
            >
              <i>{team.crestKey?<img src={mediaUrl(team.crestKey)} alt={`Stemma ${team.name}`}/>:team.shortName}</i>
              <div>
                <b>{team.name} <small>{team.squadName||"Squadra principale"}</small></b>
                <span>
                  <MapPin /> {team.city || "Città non indicata"}
                </span>
              </div>
              <button
                className="ghost-button"
                onClick={() => setEditing(!editing)}
              >
                <Edit3 /> {editing ? "Annulla" : "Modifica scheda"}
              </button>
            </section>
            {editing ? (
              <div className="profile-form">
                <div className="club-media-grid full">
                  <MediaUploader entityType="team" entityId={team.id} slot="crest" label="Carica stemma" value={team.crestKey} onDone={key=>{setTeam({...team,crestKey:key});notify("Stemma aggiornato")}}/>
                  <MediaUploader entityType="team" entityId={team.id} slot="cover" label="Carica copertina" value={team.coverKey} onDone={key=>{setTeam({...team,coverKey:key});notify("Copertina aggiornata")}}/>
                  <MediaUploader entityType="team" entityId={team.id} slot="roster" label="Foto ufficiale rosa" value={team.rosterImageKey} onDone={key=>{setTeam({...team,rosterImageKey:key});notify("Foto rosa aggiornata")}}/>
                  <MediaUploader entityType="team" entityId={team.id} slot="sponsor" label="Logo sponsor" value={team.sponsorLogoKey} onDone={key=>{setTeam({...team,sponsorLogoKey:key});notify("Sponsor aggiornato")}}/>
                </div>
                <label>
                  <span>Nome società (condiviso)</span>
                  <input
                    value={team.name}
                    onChange={(e) => setTeam({ ...team, name: e.target.value })}
                  />
                </label>
                <label><span>Nome squadra / annata</span><input value={team.squadName||""} onChange={e=>setTeam({...team,squadName:e.target.value})} placeholder="Es. 2014 o Under 12 Blu"/></label>
                <label><span>Anno di nascita prevalente</span><input type="number" min="2008" max="2022" value={team.birthYear||""} onChange={e=>setTeam({...team,birthYear:e.target.value?Number(e.target.value):null})}/></label>
                <label><span>Allenatore / referente squadra</span><input value={team.coachName||""} onChange={e=>setTeam({...team,coachName:e.target.value})}/></label>
                <label>
                  <span>Sigla</span>
                  <input
                    value={team.shortName}
                    onChange={(e) =>
                      setTeam({ ...team, shortName: e.target.value })
                    }
                  />
                </label>
                <label>
                  <span>Città</span>
                  <input
                    value={team.city}
                    onChange={(e) => setTeam({ ...team, city: e.target.value })}
                  />
                </label>
                <label>
                  <span>Colore principale</span>
                  <input
                    type="color"
                    value={team.primaryColor}
                    onChange={(e) =>
                      setTeam({ ...team, primaryColor: e.target.value })
                    }
                  />
                </label>
                <label>
                  <span>Colore secondario</span>
                  <input type="color" value={team.secondaryColor} onChange={e=>setTeam({...team,secondaryColor:e.target.value})}/>
                </label>
                <label className="full">
                  <span>Indirizzo sede</span>
                  <input
                    value={team.address}
                    onChange={(e) =>
                      setTeam({ ...team, address: e.target.value })
                    }
                  />
                </label>
                <label>
                  <span>Responsabile</span>
                  <input
                    value={team.contactName}
                    onChange={(e) =>
                      setTeam({ ...team, contactName: e.target.value })
                    }
                  />
                </label>
                <label>
                  <span>Telefono</span>
                  <input
                    value={team.phone}
                    onChange={(e) =>
                      setTeam({ ...team, phone: e.target.value })
                    }
                  />
                </label>
                <label>
                  <span>Email</span>
                  <input
                    value={team.email}
                    onChange={(e) =>
                      setTeam({ ...team, email: e.target.value })
                    }
                  />
                </label>
                <label>
                  <span>Sito web</span>
                  <input
                    value={team.website}
                    onChange={(e) =>
                      setTeam({ ...team, website: e.target.value })
                    }
                  />
                </label>
                <label className="full">
                  <span>Presentazione società</span>
                  <textarea
                    value={team.description}
                    onChange={(e) =>
                      setTeam({ ...team, description: e.target.value })
                    }
                  />
                </label>
                <button
                  className="gold-button full"
                  disabled={saving}
                  onClick={save}
                >
                  <Save /> {saving ? "Salvataggio…" : "Salva scheda"}
                </button>
              </div>
            ) : (
              <><div className="profile-facts">
                <div><small>Squadra</small><b>{team.squadName||"Squadra principale"}{team.birthYear?` · ${team.birthYear}`:""}</b></div>
                <div><small>Allenatore</small><b>{team.coachName||"Da assegnare"}</b></div>
                <div>
                  <small>Responsabile</small>
                  <b>{team.contactName || "Da assegnare"}</b>
                </div>
                <div>
                  <small>Contatti</small>
                  <b>{team.phone || team.email || "Da completare"}</b>
                </div>
                <div>
                  <small>Sede</small>
                  <b>
                    {team.address || `${team.city} · indirizzo da completare`}
                  </b>
                </div>
                <div>
                  <small>Sito</small>
                  <b>{team.website || "Non indicato"}</b>
                </div>
                {team.description && <p>{team.description}</p>}
              </div>{team.rosterImageKey&&<img className="club-roster-cover" src={mediaUrl(team.rosterImageKey)} alt={`Rosa ${team.name}`}/>}</>
            )}
            <section className="club-squads-section">
              <header><div><p className="eyebrow">Organigramma società</p><h3>Squadre di {team.name}</h3></div><button className="ghost-button" onClick={()=>setAddingSquad(!addingSquad)}><Plus/> Nuova squadra</button></header>
              {addingSquad&&<div className="new-squad-form"><input placeholder="Nome squadra, es. 2015" value={newSquad.squadName} onChange={e=>setNewSquad({...newSquad,squadName:e.target.value})}/><input type="number" placeholder="Anno" value={newSquad.birthYear} onChange={e=>setNewSquad({...newSquad,birthYear:e.target.value})}/><input placeholder="Allenatore" value={newSquad.coachName} onChange={e=>setNewSquad({...newSquad,coachName:e.target.value})}/><button className="gold-button" disabled={saving||newSquad.squadName.trim().length<2} onClick={addSquad}>Crea squadra</button></div>}
              <div className="club-squad-list">{squads.map(squad=><button key={squad.id} className={squad.id===team.id?"active":""} onClick={()=>{setSelectedPlayerId(null);setActiveTeamId(squad.id)}}><span><b>{squad.squadName}</b><small>{squad.birthYear||"Annata libera"} · {squad.coachName||"Allenatore da assegnare"}</small></span><em>{squad.rosterCount} atleti · {squad.tournamentCount} tornei</em></button>)}</div>
              <p className="squad-hint">Ogni squadra ha rosa, convocazioni, calendario, statistiche e premi indipendenti. I dati della società restano condivisi.</p>
            </section>
            <section className="roster-section">
              <header>
                <div>
                  <p className="eyebrow">Tesserati</p>
                  <h3>Rosa {team.squadName||"squadra principale"}</h3>
                </div>
                <button
                  className="gold-button"
                  onClick={() => setAddingPlayer(!addingPlayer)}
                >
                  <Plus /> Giocatore
                </button>
              </header>
              {addingPlayer && (
                <div className="inline-player-form">
                  <input
                    placeholder="Nome"
                    value={player.firstName}
                    onChange={(e) =>
                      setPlayer({ ...player, firstName: e.target.value })
                    }
                  />
                  <input
                    placeholder="Cognome"
                    value={player.lastName}
                    onChange={(e) =>
                      setPlayer({ ...player, lastName: e.target.value })
                    }
                  />
                  <input
                    type="number"
                    placeholder="Anno"
                    value={player.birthYear}
                    onChange={(e) =>
                      setPlayer({
                        ...player,
                        birthYear: Number(e.target.value),
                      })
                    }
                  />
                  <input
                    type="number"
                    placeholder="#"
                    value={player.shirtNumber}
                    onChange={(e) =>
                      setPlayer({ ...player, shirtNumber: e.target.value })
                    }
                  />
                  <button
                    className="primary-button"
                    disabled={saving}
                    onClick={addPlayer}
                  >
                    Inserisci
                  </button>
                </div>
              )}
              <div className="profile-roster">
                {players.length ? (
                  players.map((p) => (
                    <div key={p.id}>
                      <span className="player-avatar">{p.photoKey?<img src={mediaUrl(p.photoKey)} alt=""/>:p.shirtNumber ?? "—"}</span>
                      <button className="player-profile-link" onClick={()=>setSelectedPlayerId(p.id)}>
                        {p.firstName} {p.lastName}
                        <small>
                          {p.birthYear} · {p.role}
                        </small>
                        {playerAwards.some(award=>award.playerId===p.id)&&<span className="roster-badges">{playerAwards.filter(award=>award.playerId===p.id).slice(0,4).map(award=><AwardBadge compact key={award.id} type={award.type}/>)}</span>}
                      </button>
                      <Status tone="green">Attivo</Status>
                      <MediaUploader entityType="player" entityId={p.id} slot="photo" label="Foto" value={p.photoKey} onDone={async()=>{await load();notify("Foto calciatore aggiornata")}}/>
                    </div>
                  ))
                ) : (
                  <p>Nessun giocatore inserito nella rosa.</p>
                )}
              </div>
            </section>
          </>
        )}
        {team&&selectedPlayerId&&players.find(p=>p.id===selectedPlayerId)&&<PlayerProfilePanel player={players.find(p=>p.id===selectedPlayerId)!} team={team} stats={playerStats.filter(s=>s.playerId===selectedPlayerId)} milestones={milestones.filter(m=>m.playerId===selectedPlayerId)} awards={playerAwards.filter(a=>a.playerId===selectedPlayerId)} tournaments={teamTournaments} onClose={()=>setSelectedPlayerId(null)} onAction={playerAction} notify={notify}/>}
      </aside>
    </div>
  );
}

function UsersPanel({invitations,teams,saving,onInvite}:{invitations:Invitation[];teams:TeamEntry[];saving:boolean;onInvite:(payload:unknown)=>void}){const clubs=[...new Map(teams.map(team=>[team.clubId||team.id,team])).values()];const [email,setEmail]=useState("");const [role,setRole]=useState("CLUB_MANAGER");const [teamId,setTeamId]=useState(clubs[0]?.id||"");const labels:Record<string,string>={TOURNAMENT_DIRECTOR:"Direttore torneo",SECRETARIAT:"Segreteria",REFEREE:"Arbitro",CLUB_MANAGER:"Responsabile società"};return <section className="management-panel users-panel"><header><div><p className="eyebrow">Accessi contestuali</p><h3>Utenti e inviti</h3></div></header><div className="invite-form"><label><span>Email</span><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="nome@societa.it"/></label><label><span>Ruolo</span><select value={role} onChange={e=>setRole(e.target.value)}>{Object.entries(labels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>{role==="CLUB_MANAGER"&&<label><span>Società assegnata</span><select value={teamId} onChange={e=>setTeamId(e.target.value)}><option value="">Scegli società</option>{clubs.map(team=><option value={team.id} key={team.clubId||team.id}>{team.clubName||team.name}</option>)}</select></label>}<button className="gold-button" disabled={saving||!email.includes("@")||(role==="CLUB_MANAGER"&&!teamId)} onClick={()=>{onInvite({action:"invite_user",email,role,teamId:role==="CLUB_MANAGER"?teamId:null});setEmail("")}}><Mail/> Registra invito</button></div><div className="invitation-list"><div className="invitation-head"><span>Utente</span><span>Ruolo</span><span>Ambito</span><span>Stato</span></div>{invitations.length?invitations.map(invite=><article key={invite.id}><b>{invite.email}</b><span>{labels[invite.role]||invite.role}</span><span>{invite.teamName||"Intero torneo"}</span><Status tone={invite.status==="accepted"?"green":"gold"}>{invite.status==="accepted"?"Attivo":"In attesa"}</Status></article>):<div className="users-empty"><UserRound/><p>Nessun collaboratore invitato in questo torneo.</p></div>}</div><div className="access-note"><ShieldCheck/><p><b>Permessi societari</b><span>Il responsabile società gestisce tutte le squadre collegate, ma ogni rosa, convocazione, statistica e premio resta separato.</span></p></div></section>}

function StandingsPanel({rows}:{rows:Standing[]}){const groups=[...new Set(rows.map(row=>row.competitionId||`${row.category}|${row.division}`))];return <div className="standings-workspace">{groups.length?groups.map(group=>{const table=rows.filter(row=>(row.competitionId||`${row.category}|${row.division}`)===group),first=table[0];return <section className="management-panel" key={group}><header><div><p className="eyebrow">Classifica ufficiale · {first?.competitionName||"Campionato"}</p><h3>{first?.category} · {first?.division}</h3></div><Status tone="green">Solo risultati ufficiali</Status></header><div className="admin-standing-head"><span>#</span><span>Squadra</span><span>PG</span><span>GF</span><span>GS</span><span>DR</span><span>PT</span></div>{table.map((row,index)=><div className="admin-standing-row" key={`${group}-${row.id}`}><b>{index+1}</b><span><i>{row.shortName}</i>{row.name}</span><span>{row.played}</span><span>{row.gf}</span><span>{row.ga}</span><span>{row.gf-row.ga}</span><strong>{row.points}</strong></div>)}</section>}):<section className="team-empty"><BarChart3/><h3>Classifiche non disponibili</h3><p>Inserisci le squadre e ufficializza almeno un risultato.</p></section>}</div>}

function EditorialPanel({tournamentId,rows,teams,matches,saving,onAction}:{tournamentId:string;rows:EditorialPost[];teams:TeamEntry[];matches:MatchDetail[];saving:boolean;onAction:(payload:unknown,success:string)=>void}){
  const emptyDraft=()=>({type:"interview",title:"",excerpt:"",body:"",videoUrl:"",mediaKey:"",teamId:teams.length===1?teams[0].id:"",matchId:"",publishedAt:new Date(Date.now()+86400000).toISOString().slice(0,16)});
  const [open,setOpen]=useState(false),[editingId,setEditingId]=useState(""),[preview,setPreview]=useState<EditorialPost|null>(null),[filter,setFilter]=useState("all"),[draft,setDraft]=useState(emptyDraft);
  const labels:Record<string,string>={news:"Notizia",interview:"Intervista",video:"Video",gallery:"Gallery"};
  const state=(row:EditorialPost)=>row.status==="published"&&row.publishedAt&&new Date(row.publishedAt)>new Date()?"scheduled":row.status;
  const visible=rows.filter(row=>filter==="all"||state(row)===filter),officialMatches=matches.filter(match=>["official","rectified"].includes(match.status));
  function startNew(){setEditingId("");setDraft(emptyDraft());setOpen(true)}
  function edit(row:EditorialPost){setEditingId(row.id);setDraft({type:row.type,title:row.title,excerpt:row.excerpt||"",body:row.body||"",videoUrl:row.videoUrl||"",mediaKey:row.mediaKey||"",teamId:row.teamId||"",matchId:row.matchId||"",publishedAt:row.publishedAt?new Date(row.publishedAt).toISOString().slice(0,16):new Date(Date.now()+86400000).toISOString().slice(0,16)});setOpen(true)}
  function save(workflow:"draft"|"published"|"scheduled"){onAction({action:editingId?"update_editorial":"create_editorial",postId:editingId||undefined,...draft,workflow,status:workflow==="draft"?"draft":"published",publishedAt:workflow==="scheduled"?new Date(draft.publishedAt).toISOString():undefined},workflow==="draft"?"Bozza salvata":workflow==="scheduled"?"Pubblicazione programmata":"Contenuto pubblicato");setOpen(false);setEditingId("")}
  return <section className="management-panel editorial-panel"><header><div><p className="eyebrow">Future Stars Content Studio</p><h3>Notizie, interviste, foto e video</h3><p className="panel-intro">Redazione unica per lega e società: crea, modifica, programma e pubblica contenuti collegati ai dati reali del torneo.</p></div><button type="button" className="gold-button" onClick={()=>open?setOpen(false):startNew()}><Plus/> {open?"Chiudi editor":"Nuovo contenuto"}</button></header>
  <div className="content-studio-bar"><div>{[["all","Tutti"],["draft","Bozze"],["scheduled","Programmati"],["published","Pubblicati"]].map(([value,label])=><button type="button" className={filter===value?"active":""} key={value} onClick={()=>setFilter(value)}>{label}<span>{value==="all"?rows.length:rows.filter(row=>state(row)===value).length}</span></button>)}</div><select value={draft.matchId} onChange={e=>{const match=matches.find(item=>item.id===e.target.value),linked=teams.find(team=>match&&[match.homeTeamId,match.awayTeamId].includes(team.id));setDraft({...draft,matchId:e.target.value,teamId:draft.teamId||linked?.id||""})}}><option value="">Genera da una gara ufficiale…</option>{officialMatches.map(match=><option key={match.id} value={match.id}>G{match.matchDay} · {match.home} {match.homeScore??0}–{match.awayScore??0} {match.away}</option>)}</select><button className="ghost-button" disabled={saving||!draft.matchId} onClick={()=>onAction({action:"create_match_story",matchId:draft.matchId,teamId:draft.teamId||undefined},"Match story generata in bozza")}><WandSparkles/> Crea match story</button></div>
  {open&&<div className="editorial-composer content-studio-composer"><div className="editorial-fields"><label><span>Formato</span><select value={draft.type} onChange={e=>setDraft({...draft,type:e.target.value})}>{Object.entries(labels).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label><label><span>Società collegata</span><select value={draft.teamId} onChange={e=>setDraft({...draft,teamId:e.target.value})}><option value="">Contenuto della lega</option>{teams.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></label><label className="full"><span>Partita collegata</span><select value={draft.matchId} onChange={e=>setDraft({...draft,matchId:e.target.value})}><option value="">Nessuna partita</option>{matches.map(m=><option value={m.id} key={m.id}>G{m.matchDay} · {m.home} – {m.away}</option>)}</select></label><label className="full"><span>Titolo</span><input value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} placeholder="Es. La voce dell’MVP: partita speciale"/></label><label className="full"><span>Sommario</span><input value={draft.excerpt} onChange={e=>setDraft({...draft,excerpt:e.target.value})} placeholder="La frase che apparirà nella home pubblica"/></label><label className="full"><span>Testo / trascrizione</span><textarea value={draft.body} onChange={e=>setDraft({...draft,body:e.target.value})} placeholder="Intervista, comunicato o racconto della giornata…"/></label><label className="full"><span>Link video esterno (facoltativo)</span><input value={draft.videoUrl} onChange={e=>setDraft({...draft,videoUrl:e.target.value})} placeholder="YouTube, Vimeo o reel"/></label><label className="full"><span>Programma pubblicazione</span><input type="datetime-local" value={draft.publishedAt} onChange={e=>setDraft({...draft,publishedAt:e.target.value})}/></label></div><div className="editorial-media-column"><MediaUploader entityType="tournament" entityId={tournamentId} slot="editorial" label="Carica foto o video" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" value={draft.mediaKey} onDone={key=>setDraft({...draft,mediaKey:key,type:isVideoMedia(key)?"video":draft.type})}/><button type="button" className="ghost-button" onClick={()=>setPreview({...draft,id:editingId||"preview",status:"draft",createdAt:new Date().toISOString()} as EditorialPost)}><Eye/> Anteprima</button></div><footer><button type="button" className="ghost-button" disabled={saving||draft.title.length<4} onClick={()=>save("draft")}><Save/> Salva bozza</button><button type="button" className="ghost-button" disabled={saving||draft.title.length<4||!draft.publishedAt} onClick={()=>save("scheduled")}><Clock3/> Programma</button><button type="button" className="gold-button" disabled={saving||draft.title.length<4} onClick={()=>save("published")}><Newspaper/> Pubblica ora</button></footer></div>}
  <div className="editorial-grid">{visible.length?visible.map(row=>{const rowState=state(row);return <article key={row.id}>{row.mediaKey?(isVideoMedia(row.mediaKey)?<video src={mediaUrl(row.mediaKey)} controls preload="metadata"/>:<img src={mediaUrl(row.mediaKey)} alt=""/>):<div className="editorial-placeholder">{row.type==="interview"?<Mic2/>:row.type==="video"?<Video/>:<Newspaper/>}</div>}<div><span><Status tone={rowState==="published"?"green":rowState==="scheduled"?"blue":"gold"}>{rowState==="published"?"Pubblicato":rowState==="scheduled"?"Programmato":"Bozza"}</Status><small>{labels[row.type]||row.type}</small></span><h4>{row.title}</h4><p>{row.excerpt||row.body||"Contenuto in preparazione"}</p>{row.matchName&&<small className="content-link-label">Partita · {row.matchName}</small>}<footer>{row.teamName&&<em>{row.teamName}</em>}<button type="button" title="Anteprima" onClick={()=>setPreview(row)}><Eye/></button><button type="button" title="Modifica" onClick={()=>edit(row)}><Edit3/></button>{rowState!=="published"&&<button onClick={()=>onAction({action:"publish_editorial",postId:row.id},"Contenuto pubblicato")}>Pubblica</button>}{rowState!=="draft"&&<button onClick={()=>onAction({action:"unpublish_editorial",postId:row.id},"Contenuto riportato in bozza")}>Ritira</button>}<button type="button" className="row-trash" onClick={()=>onAction({action:"delete_editorial",postId:row.id},"Contenuto eliminato")}><Trash2/></button></footer></div></article>}):<div className="team-empty"><Mic2/><h3>Nessun contenuto in questa vista</h3><p>Crea un’intervista, una notizia, un video oppure genera una match story dai risultati ufficiali.</p><button type="button" className="gold-button" onClick={startNew}><Plus/> Crea contenuto</button></div>}</div>
  {preview&&<div className="content-preview-layer"><article className="content-preview"><button className="icon-button" onClick={()=>setPreview(null)}><X/></button>{preview.mediaKey&&(isVideoMedia(preview.mediaKey)?<video src={mediaUrl(preview.mediaKey)} controls/>:<img src={mediaUrl(preview.mediaKey)} alt=""/>)}<span>{labels[preview.type]||preview.type}{preview.teamName?" · "+preview.teamName:""}</span><h2>{preview.title||"Titolo contenuto"}</h2><p className="content-preview-lead">{preview.excerpt}</p><div>{preview.body||"Testo ancora da completare."}</div>{preview.videoUrl&&<a className="gold-button" href={preview.videoUrl} target="_blank" rel="noreferrer"><Video/> Guarda il video</a>}</article></div>}</section>
}

function AwardsPanel({tournamentId,rows,teams,matches,candidates,saving,onAction}:{tournamentId:string;rows:AwardEntry[];teams:TeamEntry[];matches:MatchDetail[];candidates:AwardCandidate[];saving:boolean;onAction:(payload:unknown,success:string)=>void}){
  const [open,setOpen]=useState(false);
  const [draft,setDraft]=useState({scope:"match",type:"MVP",title:"Miglior giocatore della partita",recipientType:"player",recipientName:"",playerId:"",note:"",teamId:"",matchId:"",mediaKey:""});
  const presets=["MVP","Team of the Week","Top Goal","Top Save","Rising Star","Fair Play","Coach of the Month","Club of the Year"];
  const titles:Record<string,string>={MVP:"Miglior giocatore della partita","Top Goal":"Gol più bello","Top Save":"Parata della partita","Rising Star":"Stella emergente","Fair Play":"Premio Fair Play","Team of the Week":"Squadra della settimana","Coach of the Month":"Allenatore del mese","Club of the Year":"Società dell’anno"};
  const selectedMatch=matches.find(match=>match.id===draft.matchId);
  const eligibleCandidates=candidates.filter(player=>(!draft.teamId||player.teamId===draft.teamId)&&(!selectedMatch||[selectedMatch.homeTeamId,selectedMatch.awayTeamId].includes(player.teamId)));
  function selectPlayer(playerId:string){const player=candidates.find(value=>value.id===playerId);setDraft({...draft,playerId,teamId:player?.teamId||draft.teamId,recipientName:player?`${player.firstName} ${player.lastName}`:""})}
  function selectTeam(teamId:string){const team=teams.find(value=>value.id===teamId);setDraft({...draft,teamId,playerId:"",recipientName:draft.recipientType==="team"?(team?.name||""):draft.recipientName})}
  return <section className="management-panel awards-panel"><header><div><p className="eyebrow">Recognition system</p><h3>Premi, badge e protagonisti</h3><p className="panel-intro">Ogni premio assegnato a un atleta diventa un badge permanente nella sua scheda, nella rosa e nella partita collegata.</p></div><button type="button" className="gold-button" onClick={()=>setOpen(!open)}><Trophy/> {open?"Chiudi":"Assegna premio"}</button></header>
  <div className="recognition-showcase"><img src="/experience/awards.webp" alt="Medaglia Future Stars a bordo campo"/><div><span>SISTEMA AUTOMATICO</span><h4>I numeri diventano traguardi</h4><p>Alla chiusura ufficiale della gara il sistema assegna, storicizza e pubblica i badge. Ogni rettifica ricalcola tutto senza duplicazioni.</p><div>{[["badge_debut","Esordio"],["badge_first_goal","Primo gol"],["badge_double","Doppietta"],["badge_penalty_saver","Para-rigori"],["badge_streak_5","5 presenze"],["badge_average_80","Media ≥ 8"]].map(([type,rule])=><span key={type}><AwardBadge compact type={type}/><b>{awardBadgeMeta[type]?.label||type}<small>{rule}</small></b></span>)}</div></div></div>
  <div className="badge-catalog">{presets.map(type=><article key={type}><AwardBadge type={type}/><small>{type}</small></article>)}</div>
  {open&&<div className="award-composer"><div className="editorial-fields"><label><span>Livello</span><select value={draft.scope} onChange={e=>setDraft({...draft,scope:e.target.value})}><option value="match">Partita</option><option value="team">Squadra</option><option value="month">Mensile</option><option value="tournament">Torneo</option></select></label><label><span>Tipo premio</span><select value={draft.type} onChange={e=>setDraft({...draft,type:e.target.value,title:titles[e.target.value]||e.target.value})}>{presets.map(v=><option key={v}>{v}</option>)}</select></label><label className="full"><span>Destinatario</span><div className="recipient-switch">{[["player","Atleta"],["team","Società"],["other","Staff o altro"]].map(([value,label])=><button type="button" key={value} className={draft.recipientType===value?"active":""} onClick={()=>setDraft({...draft,recipientType:value,playerId:"",recipientName:"",teamId:""})}>{label}</button>)}</div></label><label><span>Partita collegata</span><select value={draft.matchId} onChange={e=>setDraft({...draft,matchId:e.target.value,playerId:"",recipientName:"",teamId:""})}><option value="">Nessuna partita</option>{matches.map(m=><option value={m.id} key={m.id}>G{m.matchDay} · {m.home} – {m.away}</option>)}</select></label><label><span>Squadra</span><select value={draft.teamId} onChange={e=>selectTeam(e.target.value)}><option value="">Seleziona squadra</option>{teams.filter(team=>!selectedMatch||[selectedMatch.homeTeamId,selectedMatch.awayTeamId].includes(team.id)).map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></label>{draft.recipientType==="player"?<label className="full"><span>Atleta vincitore</span><select value={draft.playerId} onChange={e=>selectPlayer(e.target.value)}><option value="">Seleziona un atleta reale</option>{eligibleCandidates.map(player=><option value={player.id} key={player.id}>#{player.shirtNumber??"—"} · {player.firstName} {player.lastName} — {player.teamName}</option>)}</select></label>:draft.recipientType==="other"?<label className="full"><span>Nome destinatario</span><input value={draft.recipientName} onChange={e=>setDraft({...draft,recipientName:e.target.value})} placeholder="Allenatore, dirigente o altro protagonista"/></label>:null}<label className="full"><span>Nome del premio</span><input value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><label className="full"><span>Motivazione</span><textarea value={draft.note} onChange={e=>setDraft({...draft,note:e.target.value})} placeholder="Perché questo riconoscimento…"/></label></div><div className="award-preview"><AwardBadge type={draft.type}/><b>{draft.title}</b><span>{draft.recipientName||"Vincitore da selezionare"}</span><MediaUploader entityType="tournament" entityId={tournamentId} slot="award" label="Foto del premio" value={draft.mediaKey} onDone={key=>setDraft({...draft,mediaKey:key})}/></div><button type="button" className="gold-button" disabled={saving||draft.recipientName.length<2||(draft.recipientType==="player"&&!draft.playerId)||(draft.recipientType==="team"&&!draft.teamId)} onClick={()=>onAction({action:"create_award",...draft},"Premio assegnato: badge pubblicato nel profilo atleta")}><Trophy/> Assegna e pubblica</button></div>}
  <div className="award-feed">{rows.length?rows.map(row=><article key={row.id}>{row.mediaKey?<img src={mediaUrl(row.mediaKey)} alt=""/>:<i><AwardBadge type={row.type}/></i>}<div><small>{row.scope} · {row.matchName||row.teamName||"Torneo"}</small><h4>{row.title}</h4><b>{row.recipientName}</b><p>{row.note||"Riconoscimento Future Stars League"}</p></div><button type="button" className="row-trash" onClick={()=>onAction({action:"delete_award",awardId:row.id},"Premio eliminato")}><Trash2/></button></article>):<div className="team-empty"><Trophy/><h3>Nessun premio assegnato</h3><p>Assegna il primo riconoscimento: il badge apparirà subito sul profilo del vincitore.</p></div>}</div></section>
}

function NominationsPanel({rows,teams,matches,saving,onAction}:{rows:AwardNomination[];teams:TeamEntry[];matches:MatchDetail[];saving:boolean;onAction:(payload:unknown,success:string)=>void}){
  const [open,setOpen]=useState(false);
  const [draft,setDraft]=useState({scope:"match",awardType:"MVP",nomineeName:"",motivation:"",evidence:"",teamId:"",matchId:""});
  const criteria:Record<string,string>={MVP:"Impatto sulla gara, continuità, qualità delle scelte e comportamento.","Top Goal":"Qualità tecnica, difficoltà del gesto e importanza nel contesto della partita.","Top Save":"Difficoltà, riflessi, tecnica e valore decisivo dell’intervento.","Fair Play":"Rispetto, correttezza, aiuto agli altri e comportamento esemplare.","Rising Star":"Crescita osservabile, applicazione, coraggio e miglioramento nel periodo.","Team of the Week":"Prestazione collettiva, organizzazione, spirito di squadra e correttezza."};
  return <section className="management-panel nominations-panel"><header><div><p className="eyebrow">Percorso verificabile</p><h3>Candidature e giuria</h3></div><button className="ghost-button" onClick={()=>setOpen(!open)}><Plus/> Nuova candidatura</button></header>
    <div className="criteria-strip">{Object.entries(criteria).slice(0,4).map(([name,text])=><article key={name}><b>{name}</b><p>{text}</p></article>)}</div>
    {open&&<div className="nomination-form"><label><span>Premio</span><select value={draft.awardType} onChange={e=>setDraft({...draft,awardType:e.target.value})}>{Object.keys(criteria).map(v=><option key={v}>{v}</option>)}</select></label><label><span>Livello</span><select value={draft.scope} onChange={e=>setDraft({...draft,scope:e.target.value})}><option value="match">Partita</option><option value="team">Squadra</option><option value="month">Mensile</option><option value="tournament">Torneo</option></select></label><label><span>Candidato</span><input value={draft.nomineeName} onChange={e=>setDraft({...draft,nomineeName:e.target.value})} placeholder="Nome atleta, tecnico o società"/></label><label><span>Società</span><select value={draft.teamId} onChange={e=>setDraft({...draft,teamId:e.target.value})}><option value="">Nessuna</option>{teams.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></label><label className="full"><span>Partita</span><select value={draft.matchId} onChange={e=>setDraft({...draft,matchId:e.target.value})}><option value="">Non collegata</option>{matches.map(m=><option value={m.id} key={m.id}>{m.home} – {m.away}</option>)}</select></label><label className="full"><span>Motivazione obbligatoria</span><textarea value={draft.motivation} onChange={e=>setDraft({...draft,motivation:e.target.value})} placeholder={criteria[draft.awardType]}/></label><label className="full"><span>Dati o prove</span><input value={draft.evidence} onChange={e=>setDraft({...draft,evidence:e.target.value})} placeholder="Es. 2 gol, 1 assist, referto n. 12, clip video"/></label><button className="gold-button full" disabled={saving||draft.nomineeName.length<2||draft.motivation.length<5} onClick={()=>onAction({action:"create_nomination",...draft},"Candidatura registrata")}><Trophy/> Registra candidatura</button></div>}
    <div className="nomination-list">{rows.length?rows.map(row=><article key={row.id}><div><Status tone={row.status==="winner"?"green":row.status==="shortlisted"?"gold":row.status==="rejected"?"red":"blue"}>{row.status}</Status><small>{row.scope} · {row.awardType}</small></div><h4>{row.nomineeName}</h4><p>{row.motivation}</p>{row.evidence&&<em>{row.evidence}</em>}<footer>{row.status==="nominated"&&<button className="ghost-button" disabled={saving} onClick={()=>onAction({action:"review_nomination",nominationId:row.id,status:"shortlisted"},"Candidato inserito in shortlist")}>Shortlist</button>}{!["winner","rejected"].includes(row.status)&&<><button className="ghost-button" disabled={saving} onClick={()=>onAction({action:"review_nomination",nominationId:row.id,status:"rejected"},"Candidatura archiviata")}>Escludi</button><button className="gold-button" disabled={saving} onClick={()=>onAction({action:"review_nomination",nominationId:row.id,status:"winner"},"Vincitore proclamato e premio pubblicato")}>Proclama vincitore</button></>}</footer></article>):<div className="team-empty"><ShieldCheck/><h3>Nessuna candidatura</h3><p>Ogni premio nascerà da una motivazione registrata e da una decisione tracciabile.</p></div>}</div>
  </section>
}

const euro=(cents:number)=>new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format((Number(cents)||0)/100);
function PaymentsPanel({tournamentId,notify}:{tournamentId:string;notify:(message:string)=>void}){
  const [data,setData]=useState<{matchFeeCents:number;summary:PaymentSummary[];matches:PaymentMatchRow[];entries:PaymentEntry[];canManage:boolean}|null>(null);
  const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [open,setOpen]=useState(false);const [teamFilter,setTeamFilter]=useState("");
  const [draft,setDraft]=useState({teamId:"",matchId:"",amount:"",method:"bank_transfer",paidAt:new Date().toISOString().slice(0,10),reference:"",notes:""});
  async function load(){setLoading(true);const response=await fetch(`/api/tournaments/${tournamentId}/payments`,{cache:"no-store"});const body=await response.json() as any;setLoading(false);if(!response.ok){notify(body.error||"Impossibile caricare i pagamenti");return}setData(body)}
  useEffect(()=>{void load()},[tournamentId]);
  async function send(payload:unknown,message:string){setSaving(true);const response=await fetch(`/api/tournaments/${tournamentId}/payments`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const body=await response.json() as any;setSaving(false);if(!response.ok){notify(body.error||"Operazione non riuscita");return false}await load();notify(message);return true}
  if(loading&&!data)return <div className="workspace-loading">Caricamento situazione economica…</div>;
  if(!data)return <section className="team-empty"><CircleDollarSign/><h3>Dati economici non disponibili</h3></section>;
  const due=data.summary.reduce((sum,row)=>sum+row.dueCents,0),paid=data.summary.reduce((sum,row)=>sum+row.paidCents,0),balance=due-paid;
  const filteredMatches=data.matches.filter(row=>!teamFilter||row.teamId===teamFilter),filteredEntries=data.entries.filter(row=>!teamFilter||row.teamId===teamFilter);
  const teamMatches=data.matches.filter(row=>row.teamId===draft.teamId);
  return <div className="payments-workspace">
    <section className="finance-hero"><div><p className="eyebrow">Amministrazione torneo</p><h2>Pagamenti e quote partita</h2><p>Quota attuale: <b>{euro(data.matchFeeCents)}</b> per ogni atleta convocato. Ogni distinta salva la quota applicata in quel momento.</p></div>{data.canManage&&<button className="gold-button" onClick={()=>setOpen(!open)}><Plus/> Registra pagamento</button>}</section>
    <div className="finance-metrics"><article><small>DA INCASSARE</small><strong>{euro(due)}</strong><span>{data.summary.reduce((sum,row)=>sum+row.callups,0)} convocazioni</span></article><article><small>INCASSATO</small><strong>{euro(paid)}</strong><span>{due?Math.min(100,Math.round(paid/due*100)):0}% coperto</span></article><article className={balance>0?"attention":"positive"}><small>SALDO RESIDUO</small><strong>{euro(balance)}</strong><span>{data.summary.filter(row=>row.balanceCents>0).length} società da saldare</span></article></div>
    {open&&data.canManage&&<section className="payment-composer"><header><div><p className="eyebrow">Nuovo movimento</p><h3>Registra un incasso</h3></div><button className="icon-button" onClick={()=>setOpen(false)}><X/></button></header><div><label><span>Società</span><select value={draft.teamId} onChange={e=>setDraft({...draft,teamId:e.target.value,matchId:""})}><option value="">Seleziona società</option>{data.summary.map(row=><option value={row.teamId} key={row.teamId}>{row.teamName} · residuo {euro(row.balanceCents)}</option>)}</select></label><label><span>Partita facoltativa</span><select value={draft.matchId} onChange={e=>setDraft({...draft,matchId:e.target.value})}><option value="">Acconto/saldo generale</option>{teamMatches.map(row=><option value={row.matchId} key={row.matchId}>G{row.matchDay} · vs {row.opponent} · {euro(row.dueCents-row.paidCents)}</option>)}</select></label><label><span>Importo (€)</span><input type="number" min="0.01" step="0.01" value={draft.amount} onChange={e=>setDraft({...draft,amount:e.target.value})} placeholder="0,00"/></label><label><span>Metodo</span><select value={draft.method} onChange={e=>setDraft({...draft,method:e.target.value})}><option value="bank_transfer">Bonifico</option><option value="cash">Contanti</option><option value="card">Carta</option><option value="other">Altro</option></select></label><label><span>Data pagamento</span><input type="date" value={draft.paidAt} onChange={e=>setDraft({...draft,paidAt:e.target.value})}/></label><label><span>Riferimento</span><input value={draft.reference} onChange={e=>setDraft({...draft,reference:e.target.value})} placeholder="CRO, ricevuta o nominativo"/></label><label className="full"><span>Note</span><textarea value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})} placeholder="Annotazioni amministrative"/></label></div><footer><button className="gold-button" disabled={saving||!draft.teamId||Number(draft.amount)<=0} onClick={()=>void send({action:"record_payment",...draft,amountCents:Math.round(Number(draft.amount)*100)},"Pagamento registrato").then(ok=>{if(ok){setOpen(false);setDraft({...draft,matchId:"",amount:"",reference:"",notes:""})}})}><CircleDollarSign/> {saving?"Registrazione…":"Registra incasso"}</button></footer></section>}
    <section className="management-panel finance-teams"><header><div><p className="eyebrow">Situazione società</p><h3>Dovuto, pagato e saldo</h3></div><select value={teamFilter} onChange={e=>setTeamFilter(e.target.value)}><option value="">Tutte le società</option>{data.summary.map(row=><option value={row.teamId} key={row.teamId}>{row.teamName}</option>)}</select></header><div className="finance-team-head"><span>Società</span><span>Convocazioni</span><span>Dovuto</span><span>Pagato</span><span>Residuo</span><span>Stato</span></div>{data.summary.filter(row=>!teamFilter||row.teamId===teamFilter).map(row=><article key={row.teamId}><span><i style={{background:row.primaryColor}}>{row.shortName}</i><b>{row.teamName}</b></span><span>{row.callups}</span><span>{euro(row.dueCents)}</span><span>{euro(row.paidCents)}</span><strong>{euro(row.balanceCents)}</strong><Status tone={row.balanceCents<=0?"green":row.paidCents>0?"gold":"red"}>{row.balanceCents<=0?"Saldato":row.paidCents>0?"Parziale":"Da pagare"}</Status></article>)}</section>
    <div className="finance-detail-grid"><section className="management-panel"><header><div><p className="eyebrow">Quote generate</p><h3>Dettaglio partite</h3></div></header><div className="payment-match-list">{filteredMatches.length?filteredMatches.map(row=><article key={`${row.matchId}-${row.teamId}`}><time>{new Date(row.startsAt).toLocaleDateString("it-IT",{day:"2-digit",month:"short"})}</time><span><b>{row.teamName}</b><small>G{row.matchDay} · {row.category} {row.division} · vs {row.opponent}</small></span><em>{row.callups} × {euro(row.callups?row.dueCents/row.callups:data.matchFeeCents)}</em><strong>{euro(row.dueCents-row.paidCents)}</strong></article>):<p className="finance-empty">Le quote compariranno quando verranno salvati i convocati.</p>}</div></section><section className="management-panel"><header><div><p className="eyebrow">Prima nota</p><h3>Movimenti registrati</h3></div></header><div className="payment-ledger">{filteredEntries.length?filteredEntries.map(entry=><article key={entry.id}><span><b>{entry.teamName}</b><small>{new Date(entry.paidAt).toLocaleDateString("it-IT")} · {entry.method.replaceAll("_"," ")}{entry.matchName?` · ${entry.matchName}`:""}</small>{entry.reference&&<em>{entry.reference}</em>}</span><strong>{euro(entry.amountCents)}</strong>{data.canManage&&<button className="row-trash" onClick={()=>void send({action:"delete_payment",paymentId:entry.id},"Pagamento eliminato")}><Trash2/></button>}</article>):<p className="finance-empty">Nessun pagamento ancora registrato.</p>}</div></section></div>
  </div>
}

function ErrorsPanel({rows,saving,onUpdate}:{rows:ErrorReport[];saving:boolean;onUpdate:(payload:unknown)=>void}){const [notes,setNotes]=useState<Record<string,string>>({});return <section className="management-panel errors-panel"><header><div><p className="eyebrow">Controllo qualità</p><h3>Segnalazioni e verifiche</h3></div><Status tone={rows.some(v=>v.status==="open")?"red":"green"}>{rows.filter(v=>v.status==="open").length} aperte</Status></header>{rows.length?rows.map(row=><article key={row.id}><div><Status tone={row.status==="open"?"red":row.status==="reviewing"?"gold":"green"}>{row.status}</Status><span>{row.matchName||"Segnalazione generale"}</span><time>{new Date(row.createdAt).toLocaleDateString("it-IT")}</time></div><h4>{row.subject}</h4><p>{row.description}</p><textarea value={notes[row.id]??row.resolution??""} onChange={e=>setNotes({...notes,[row.id]:e.target.value})} placeholder="Esito o richiesta di integrazione…"/><footer><button className="ghost-button" disabled={saving} onClick={()=>onUpdate({action:"resolve_error",errorId:row.id,status:"reviewing",resolution:notes[row.id]||"Verifica avviata"})}>Metti in verifica</button><button className="ghost-button" disabled={saving} onClick={()=>onUpdate({action:"resolve_error",errorId:row.id,status:"rejected",resolution:notes[row.id]||"Segnalazione respinta"})}>Respingi</button><button className="gold-button" disabled={saving} onClick={()=>onUpdate({action:"resolve_error",errorId:row.id,status:"resolved",resolution:notes[row.id]||"Errore risolto"})}>Risolvi</button></footer></article>):<div className="team-empty"><ShieldCheck/><h3>Nessuna segnalazione</h3><p>Non risultano errori aperti per questo torneo.</p></div>}</section>}

function CreateMatchDrawer({teams,referees,fields,scheduleConfig,saving,onClose,onCreate}:{teams:TeamEntry[];referees:RefereeOption[];fields:TournamentField[];scheduleConfig:ScheduleConfig;saving:boolean;onClose:()=>void;onCreate:(payload:unknown)=>void}){
  const competitions=[...new Set(teams.map(team=>`${team.category}|${team.division}`))];
  const [competition,setCompetition]=useState(competitions[0]||"");
  const [homeTeamId,setHomeTeamId]=useState("");
  const [awayTeamId,setAwayTeamId]=useState("");
  const availableFields=fields.filter(item=>Boolean(item.active));
  const [startsAt,setStartsAt]=useState(`${scheduleConfig.startDate}T${scheduleConfig.startTime}`);
  const [venue,setVenue]=useState(availableFields[0]?.venueName||"");
  const [field,setField]=useState(availableFields[0]?.fieldName||"");
  const [refereeName,setRefereeName]=useState("");
  const [matchDay,setMatchDay]=useState(1);
  const [category,division]=competition.split("|");
  const eligible=teams.filter(team=>team.category===category&&team.division===division);
  return <div className="drawer-layer" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><aside className="create-match-drawer"><header><div><p className="eyebrow">Calendario</p><h2>Nuova partita</h2></div><button className="icon-button" onClick={onClose}><X/></button></header><div className="schedule-grid create-match-grid">
    <label className="full"><span>Categoria e serie</span><select value={competition} onChange={e=>{setCompetition(e.target.value);setHomeTeamId("");setAwayTeamId("")}}>{competitions.map(value=>{const [cat,div]=value.split("|");return <option value={value} key={value}>{cat} · {div}</option>})}</select></label>
    <label><span>Squadra casa</span><select value={homeTeamId} onChange={e=>setHomeTeamId(e.target.value)}><option value="">Seleziona</option>{eligible.map(team=><option value={team.id} key={team.id}>{team.name}</option>)}</select></label>
    <label><span>Squadra ospite</span><select value={awayTeamId} onChange={e=>setAwayTeamId(e.target.value)}><option value="">Seleziona</option>{eligible.filter(team=>team.id!==homeTeamId).map(team=><option value={team.id} key={team.id}>{team.name}</option>)}</select></label>
    <label><span>Data e ora</span><input type="datetime-local" value={startsAt} onChange={e=>setStartsAt(e.target.value)}/></label><label><span>Giornata</span><input type="number" min="1" value={matchDay} onChange={e=>setMatchDay(Number(e.target.value))}/></label>
    <label className="full"><span>Sede e campo</span><select value={`${venue}|${field}`} onChange={e=>{const selected=availableFields.find(item=>`${item.venueName}|${item.fieldName}`===e.target.value);setVenue(selected?.venueName||"");setField(selected?.fieldName||"")}}>{availableFields.map(item=><option key={item.id||`${item.venueName}-${item.fieldName}`} value={`${item.venueName}|${item.fieldName}`}>{item.venueName} · {item.fieldName}{item.fieldNumber?` (${item.fieldNumber})`:""}</option>)}</select></label>
    <label className="full"><span>Arbitro</span><input list="new-match-referees" value={refereeName} onChange={e=>setRefereeName(e.target.value)} placeholder="Assegna ora o successivamente"/><datalist id="new-match-referees">{referees.map(referee=><option key={referee.email} value={referee.name}/>)}</datalist></label>
  </div><div className="schedule-note"><AlertTriangle/> Se rileva un conflitto, la partita non viene salvata e indica cosa correggere.</div><footer><button className="ghost-button" onClick={onClose}>Annulla</button><button className="gold-button" disabled={saving||!homeTeamId||!awayTeamId} onClick={()=>onCreate({action:"create_match",homeTeamId,awayTeamId,category,division,startsAt:scheduleIso(startsAt),venue,field,refereeName,matchDay})}><Plus/> Crea partita</button></footer></aside></div>
}

function TournamentScreen({
  tournamentId,
  initialTab,
  onBack,
  notify,
}: {
  tournamentId: string;
  initialTab?: TournamentTab;
  onBack: () => void;
  notify: (v: string) => void;
}) {
  const [data, setData] = useState<TournamentWorkspace | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [tab, setTab] = useState<TournamentTab>(initialTab || "overview");
  const [addMode, setAddMode] = useState<"directory" | "new" | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<MatchDetail | null>(null);
  const [profileTeamId, setProfileTeamId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [squadName,setSquadName]=useState("2014");
  const [squadBirthYear,setSquadBirthYear]=useState("2014");
  const [category, setCategory] = useState("2014");
  const [division, setDivision] = useState("Serie A");
  const [saving, setSaving] = useState(false);
  const [calendarDay, setCalendarDay] = useState("all");
  const [calendarCompetition, setCalendarCompetition] = useState("all");
  const [creatingMatch, setCreatingMatch] = useState(false);
  async function load() {
    setState("loading");
    try {
      const response = await fetch(
        `/api/tournaments/${tournamentId}/workspace`,
        { cache: "no-store" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setData(body);
      const firstCompetition=body.settings?.find((item:CompetitionSetting)=>Boolean(item.enabled));
      if(firstCompetition){setCategory(firstCompetition.category);setDivision(firstCompetition.division);setSquadName(firstCompetition.category);setSquadBirthYear(/^\d{4}$/.test(firstCompetition.category)?firstCompetition.category:"")}
      setState("ready");
    } catch {
      setState("error");
    }
  }
  useEffect(() => {
    setTab(initialTab || "overview");
    void load();
  }, [tournamentId, initialTab]);
  async function action(payload: unknown, success: string) {
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch(
        `/api/tournaments/${tournamentId}/workspace`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        notify(body.error ?? "Operazione non riuscita");
        return false;
      }
      await load();
      notify(success);
      return true;
    } catch {
      notify("Connessione non disponibile");
      return false;
    } finally {
      setSaving(false);
    }
  }
  async function addTeam() {
    const ok = await action(
      addMode === "new"
        ? { action: "create", name, shortName, squadName, birthYear:squadBirthYear, category, division }
        : { action: "bulk_link", teamIds, category, division },
      addMode === "new"
        ? "Società creata e invitata"
        : `${teamIds.length} società invitate`,
    );
    if (ok) {
      setAddMode(null);
      setName("");
      setShortName("");
      setSquadName(category);
      setSquadBirthYear(/^\d{4}$/.test(category)?category:"");
      setTeamIds([]);
      setTab("teams");
    }
  }
  async function seedSummerDemoRosters(){
    if(saving)return;setSaving(true);
    try{const response=await fetch(`/api/tournaments/${tournamentId}/workspace`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"seed_summer_demo_rosters"})}),body=await response.json();if(!response.ok){notify(body.error??"Creazione rose non riuscita");return}await load();setCalendarDay("1");setTab("matches");notify("Create 4 rose da 14 giocatori: la prima partita è pronta per il tabellino")}catch{notify("Connessione non disponibile")}finally{setSaving(false)}
  }
  if (state === "loading")
    return (
      <div className="workspace-loading">Caricamento gestione torneo…</div>
    );
  if (state === "error" || !data)
    return (
      <div className="empty-workspace">
        <h2>Impossibile aprire il torneo</h2>
        <button className="ghost-button" onClick={onBack}>
          Torna all’Hub
        </button>
      </div>
    );
  const filtered = data.directory.filter((team) =>
    `${team.clubName||team.name} ${team.squadName||""}`.toLowerCase().includes(query.toLowerCase()),
  );
  const isAdmin = data.viewerRole === "SUPER_ADMIN";
  const isDirector = data.viewerRole === "TOURNAMENT_DIRECTOR";
  const canContent = ["SUPER_ADMIN", "TOURNAMENT_DIRECTOR", "SECRETARIAT"].includes(data.viewerRole);
  const canEditorial = canContent || data.viewerRole === "CLUB_MANAGER";
  const canFinance = data.viewerRole !== "REFEREE";
  const competitionKey=(match:MatchDetail)=>match.competitionId||`${match.category}|${match.division}`;
  const filteredMatches=data.matches.filter(match=>(calendarDay==="all"||String(match.matchDay)===calendarDay)&&(calendarCompetition==="all"||competitionKey(match)===calendarCompetition));
  const availableCompetitions=data.settings.filter(item=>Boolean(item.enabled));
  const roleLabel: Record<string, string> = {
    SUPER_ADMIN: "Super Admin",
    TOURNAMENT_DIRECTOR: "Direttore torneo",
    SECRETARIAT: "Segreteria",
    REFEREE: "Arbitro",
    CLUB_MANAGER: "Responsabile società",
  };
  return (
    <>
      <section className="tournament-workspace-head">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={16} /> Hub tornei
        </button>
        <div>
          <span>
            <Status
              tone={data.tournament.status === "draft" ? "blue" : "green"}
            >
              {data.tournament.status === "draft" ? "Bozza" : "Attivo"}
            </Status>
            <Status tone={Boolean(data.tournament.isPublic)?"green":"gold"}>{Boolean(data.tournament.isPublic)?"Pubblico":"Privato"}</Status>
            <small>{data.tournament.edition}</small>
          </span>
          <h2>{data.tournament.name}</h2>
          <p>
            {data.teams.length} squadre inserite ·{" "}
            {data.tournament.plannedTeams || "nessun limite"} previste ·{" "}
            {data.tournament.fieldCount} campi
          </p>
        </div>
        {isAdmin ? (
          <div className="tournament-head-actions">
            <button className={Boolean(data.tournament.isPublic)?"ghost-button":"gold-button"} disabled={saving} onClick={()=>void action({action:Boolean(data.tournament.isPublic)?"unpublish_tournament":"publish_tournament"},Boolean(data.tournament.isPublic)?"Torneo rimosso dal portale pubblico":"Torneo pubblicato: ora è visibile nel portale pubblico")}>
              {Boolean(data.tournament.isPublic)?<LockKeyhole/>:<Share2/>} {Boolean(data.tournament.isPublic)?"Rendi privato":"Pubblica torneo"}
            </button>
            <button className="ghost-button" onClick={() => {setTab("teams");setAddMode("directory")}}><Plus /> Invita società</button>
          </div>
        ) : (
          <span className="role-access-badge">
            <ShieldCheck /> {roleLabel[data.viewerRole] || data.viewerRole}
          </span>
        )}
      </section>
      <nav className="workspace-tabs">
        <button
          className={tab === "overview" ? "active" : ""}
          onClick={() => setTab("overview")}
        >
          Panoramica
        </button>
        <button
          className={tab === "teams" ? "active" : ""}
          onClick={() => setTab("teams")}
        >
          Squadre <span>{data.teams.length}</span>
        </button>
        {isAdmin && <button
          className={tab === "structure" ? "active" : ""}
          onClick={() => setTab("structure")}
        >Categorie e Serie <span>{data.settings.filter((v) => Boolean(v.enabled)).length}</span></button>}
        <button
          className={tab === "matches" ? "active" : ""}
          onClick={() => setTab("matches")}
        >
          Partite <span>{data.matches.length}</span>
        </button>
        {(isAdmin || isDirector) && <button
          className={tab === "standings" ? "active" : ""}
          onClick={() => setTab("standings")}
        >
          Classifiche
        </button>}
        {isAdmin&&<button className={tab==="season"?"active":""} onClick={()=>setTab("season")}>
          Fine stagione <span>{data.seasonOutcomes?.length||0}</span>
        </button>}
        {canFinance&&<button className={tab==="payments"?"active":""} onClick={()=>setTab("payments")}>
          Pagamenti
        </button>}
        {canEditorial && <button className={tab === "content" ? "active" : ""} onClick={() => setTab("content")}>
          Blog e interviste <span>{data.editorialPosts.length}</span>
        </button>}
        {canContent && <button className={tab === "awards" ? "active" : ""} onClick={() => setTab("awards")}>
          Premi <span>{data.awards.length}</span>
        </button>}
        {(isAdmin || isDirector) && <button
          className={tab === "errors" ? "active" : ""}
          onClick={() => setTab("errors")}
        >Segnalazioni <span>{data.errorReports.filter(v=>v.status==="open").length}</span></button>}
        {isAdmin && <button
          className={tab === "users" ? "active" : ""}
          onClick={() => setTab("users")}
        >
          Utenti <span>{data.invitations.length}</span>
        </button>}
      </nav>
      {tab === "overview" && (
        <div className="workspace-overview">
          <button onClick={() => setTab("teams")}>
            <Building2 />
            <span>
              <small>ANAGRAFICA TORNEO</small>
              <b>{data.teams.length} squadre inserite</b>
              <em>
                {data.teams.length
                  ? "Apri società, schede e rose"
                  : "Il torneo è vuoto: inserisci la prima squadra"}
              </em>
            </span>
            <ChevronRight />
          </button>
          <button onClick={() => setTab("matches")}>
            <CalendarDays />
            <span>
              <small>CALENDARIO</small>
              <b>{data.matches.length} partite</b>
              <em>
                {data.matches.length
                  ? "Apri programma e dettagli"
                  : "Genera dopo aver inserito le squadre"}
              </em>
            </span>
            <ChevronRight />
          </button>
          <button onClick={() => setTab("structure")}>
            <ListPlus />
            <span>
              <small>STRUTTURA</small>
              <b>
                {data.settings.filter((v) => Boolean(v.enabled)).length}{" "}
                competizioni attive
              </b>
              <em>Configura annate, Serie A/B e capienza</em>
            </span>
            <ChevronRight />
          </button>
          {canEditorial&&<button onClick={()=>setTab("content")}>
            <Newspaper/>
            <span><small>MEDIA CENTER</small><b>{data.editorialPosts.length} contenuti</b><em>Gestisci blog, interviste, foto e video</em></span>
            <ChevronRight/>
          </button>}
          {canContent&&<button onClick={()=>setTab("awards")}>
            <Trophy/>
            <span><small>PREMI E BADGE</small><b>{data.awards.length} riconoscimenti</b><em>Assegna MVP, Fair Play e premi del torneo</em></span>
            <ChevronRight/>
          </button>}
          {canFinance&&<button onClick={()=>setTab("payments")}>
            <CircleDollarSign/>
            <span><small>AMMINISTRAZIONE</small><b>Quote e pagamenti</b><em>{euro(data.scheduleConfig.matchFeeCents)} per convocato</em></span>
            <ChevronRight/>
          </button>}
        </div>
      )}
      {tab === "teams" && (
        <section className="management-panel">
          <header>
            <div>
              <p className="eyebrow">Società partecipanti</p>
              <h3>Squadre del torneo</h3>
            </div>
            <div>
              {data.demoRostersAvailable&&!data.demoRostersReady&&<button className="ghost-button" disabled={saving} onClick={()=>void seedSummerDemoRosters()}><WandSparkles/> Genera 4 rose demo</button>}
              {data.demoRostersReady&&<Status tone="green">4 rose demo pronte</Status>}
              <button
                className="ghost-button"
                onClick={() => setAddMode("directory")}
              >
                <Search /> Invito multiplo
              </button>
              <button className="gold-button" onClick={() => setAddMode("new")}>
                <Plus /> Nuova società
              </button>
            </div>
          </header>
          {data.teams.length ? (
            <div className="teams-table">
              <div className="teams-table-head">
                <span>Squadra</span>
                <span>Categoria</span>
                <span>Serie</span>
                <span>Stato</span>
                <span />
              </div>
              {data.teams.map((team, index) => (
                <article key={`${team.entryId}-${index}`}>
                  <button
                    className="team-cell"
                    onClick={() => setProfileTeamId(team.id)}
                  >
                    <i style={{ background: team.primaryColor }}>
                      {team.shortName}
                    </i>
                    <b>
                      {team.clubName||team.name}
                      <small>Squadra {team.squadName||team.category} · {team.city} · {team.rosterCount||0} giocatori · Apri rosa separata</small>
                    </b>
                  </button>
                  <span>{team.category}</span>
                  <span>{team.division}</span>
                  <Status tone={team.status === "confirmed" ? "green" : "gold"}>
                    {team.status === "confirmed" ? "Confermata" : "Invitata"}
                  </Status>
                  {isAdmin && <button
                    className="row-trash"
                    aria-label={`Rimuovi ${team.name}`}
                    onClick={() =>
                      void action(
                        { action: "remove_team", entryId: team.entryId },
                        "Squadra rimossa dal torneo",
                      )
                    }
                  >
                    <Trash2 />
                  </button>}
                </article>
              ))}
            </div>
          ) : (
            <div className="team-empty">
              <UsersRound />
              <h3>Nessuna squadra inserita</h3>
              <p>
                Questo torneo è vuoto. Scegli più società dall’anagrafica oppure
                creane una nuova.
              </p>
              <div>
                <button
                  className="ghost-button"
                  onClick={() => setAddMode("directory")}
                >
                  <Search /> Invito multiplo
                </button>
                <button
                  className="gold-button"
                  onClick={() => setAddMode("new")}
                >
                  <Plus /> Crea società
                </button>
              </div>
            </div>
          )}
        </section>
      )}
      {tab === "structure" && (
        <StructurePanel
          settings={data.settings}
          teams={data.teams}
          matches={data.matches}
          fields={data.fields}
          scheduleConfig={data.scheduleConfig}
          saving={saving}
          onSave={(settings,fields,scheduleConfig) =>
            void action(
              { action: "save_structure", settings, fields, scheduleConfig },
              "Struttura del torneo salvata",
            )
          }
          onGenerateFinals={(competitionId)=>void action({action:"generate_final_phase",competitionId},"Primo turno della fase finale generato")}
          onAdvanceFinals={(competitionId)=>void action({action:"advance_final_phase",competitionId},"Tabellone aggiornato")}
          onGeneratePlayout={(competitionId)=>void action({action:"generate_playout",competitionId},"Tabellone playout generato")}
          onAdvancePlayout={(competitionId)=>void action({action:"advance_playout",competitionId},"Playout aggiornati")}
          onOpenMatch={setSelectedMatch}
        />
      )}
      {tab === "matches" && (
        <section className="management-panel">
          <header>
            <div>
              <p className="eyebrow">Calendario</p>
              <h3>Partite programmate</h3>
            </div>
            <div className="calendar-actions"><select value={calendarDay} onChange={e=>setCalendarDay(e.target.value)}><option value="all">Tutte le giornate</option>{[...new Set(data.matches.map(m=>m.matchDay))].sort((a,b)=>a-b).map(day=><option value={String(day)} key={day}>Giornata {day}</option>)}</select><select value={calendarCompetition} onChange={e=>setCalendarCompetition(e.target.value)}><option value="all">Tutte le competizioni</option>{[...new Map(data.matches.map(m=>[competitionKey(m),m])).entries()].map(([value,m])=><option value={value} key={value}>{m.competitionName||"Campionato"} · {m.category} · {m.division}</option>)}</select>{(isAdmin || isDirector) && <button className="ghost-button" onClick={()=>setCreatingMatch(true)}><Plus/> Nuova partita</button>}{(isAdmin || isDirector) && <button
              className="gold-button"
              disabled={saving || data.teams.length < 2}
              onClick={() =>
                void action(
                  { action: "generate_calendar" },
                  "Calendario generato rispettando un impegno per squadra nel weekend",
                )
              }
            >
              <WandSparkles />{" "}
              {data.matches.length
                ? "Rigenera calendario"
                : "Genera calendario"}
            </button>}</div>
          </header>
          {data.matches.length ? (
            <div className="workspace-matches">
              {filteredMatches.map((match,index) => {
                const date = new Date(match.startsAt);
                return (
                  <React.Fragment key={match.id}>{(index===0||filteredMatches[index-1].matchDay!==match.matchDay)&&<div className="calendar-day-divider"><span>Giornata {match.matchDay}</span><small>{date.toLocaleDateString("it-IT",{weekday:"long",day:"2-digit",month:"long"})}</small></div>}<button
                    key={match.id}
                    onClick={() => setSelectedMatch(match)}
                  >
                    <time>
                      {date.toLocaleTimeString("it-IT", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      <small>
                        {date.toLocaleDateString("it-IT", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </small>
                    </time>
                    <span>
                      <b>{match.home}</b>
                      <em>{match.status === "official" || match.status === "rectified" ? `${match.homeScore ?? 0}–${match.awayScore ?? 0}` : "VS"}</em>
                      <b>{match.away}</b>
                    </span>
                    <span>
                      <small>
                        {match.tournamentName} · {match.tournamentEdition} · {match.competitionName||"Campionato"} · {match.roundName||`Giornata ${match.matchDay}`} · {match.category} ·{" "}
                        {match.division}
                      </small>
                      <b>
                        {match.venue} · {match.field}
                      </b>
                      <Status tone={match.status==="official"||match.status==="rectified"?"green":match.status==="postponed"||match.status==="cancelled"?"red":match.status==="live"?"blue":"gold"}>{matchStatusLabel[match.status]||match.status}</Status>
                    </span>
                    <ChevronRight />
                  </button></React.Fragment>
                );
              })}
            </div>
          ) : (
            <div className="team-empty">
              <CalendarDays />
              <h3>Nessuna partita</h3>
              <p>
                Inserisci almeno due squadre nella stessa categoria e Serie, poi
                genera il girone unico di sola andata.
              </p>
              <button className="gold-button" onClick={() => setTab("teams")}>
                <Plus /> Inserisci squadre
              </button>
            </div>
          )}
        </section>
      )}
      {tab === "standings" && <StandingsPanel rows={data.standings} />}
      {tab === "season" && <SeasonPanel tournament={data.tournament} settings={data.settings} teams={data.teams} outcomes={data.seasonOutcomes||[]} saving={saving} onAction={(payload,success)=>void action(payload,success)}/>}
      {tab === "payments" && <PaymentsPanel tournamentId={tournamentId} notify={notify}/>}
      {tab === "content" && <EditorialPanel tournamentId={tournamentId} rows={data.editorialPosts} teams={data.teams} matches={data.matches} saving={saving} onAction={(payload,success)=>void action(payload,success)}/>}
      {tab === "awards" && <div className="awards-workspace"><AwardsPanel tournamentId={tournamentId} rows={data.awards} teams={data.teams} matches={data.matches} candidates={data.awardCandidates||[]} saving={saving} onAction={(payload,success)=>void action(payload,success)}/><NominationsPanel rows={data.nominations} teams={data.teams} matches={data.matches} saving={saving} onAction={(payload,success)=>void action(payload,success)}/></div>}
      {tab === "users" && (
        <UsersPanel
          invitations={data.invitations}
          teams={data.teams}
          saving={saving}
          onInvite={(payload) =>
            void action(payload, "Invito registrato nel torneo")
          }
        />
      )}
      {tab === "errors" && (
        <ErrorsPanel
          rows={data.errorReports}
          saving={saving}
          onUpdate={(payload) => void action(payload, "Segnalazione aggiornata")}
        />
      )}
      {addMode && (
        <div
          className="modal-layer"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAddMode(null);
          }}
        >
          <section className="team-modal" role="dialog" aria-modal="true">
            <header>
              <div>
                <p className="eyebrow">
                  {addMode === "directory"
                    ? "Anagrafica squadre"
                    : "Nuova società e prima squadra"}
                </p>
                <h2>
                  {addMode === "directory"
                    ? "Invita più squadre"
                    : "Crea società e squadra"}
                </h2>
              </div>
              <button className="icon-button" onClick={() => setAddMode(null)}>
                <X />
              </button>
            </header>
            {addMode === "directory" ? (
              <>
                <label className="team-search">
                  <Search />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Cerca società o squadra…"
                  />
                </label>
                <div className="selection-tools">
                  <span>{teamIds.length} selezionate</span>
                  <button onClick={() => setTeamIds(filtered.map((v) => v.id))}>
                    Seleziona tutte
                  </button>
                  <button onClick={() => setTeamIds([])}>Azzera</button>
                </div>
                <div className="directory-list">
                  {filtered.map((team) => {
                    const selected = teamIds.includes(team.id);
                    return (
                      <button
                        key={team.id}
                        className={selected ? "selected" : ""}
                        onClick={() =>
                          setTeamIds((values) =>
                            selected
                              ? values.filter((id) => id !== team.id)
                              : [...values, team.id],
                          )
                        }
                      >
                        <i style={{ background: team.primaryColor }}>
                          {team.shortName}
                        </i>
                        <span>
                          <b>{team.clubName||team.name}</b>
                          <small>Squadra {team.squadName||"principale"} · {team.birthYear||team.city}</small>
                        </span>
                        <span className="multi-check">
                          {selected && <Check />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="team-form">
                <label>
                  <span>Nome società</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Es. Tor Tre Teste"
                  />
                </label>
                <label>
                  <span>Sigla stemma</span>
                  <input
                    value={shortName}
                    onChange={(e) => setShortName(e.target.value)}
                    placeholder="TTT"
                    maxLength={4}
                  />
                </label>
                <label><span>Squadra / annata</span><input value={squadName} onChange={e=>setSquadName(e.target.value)} placeholder="Es. 2014 o Under 12 Blu"/></label>
                <label><span>Anno di nascita prevalente</span><input type="number" min="2008" max="2022" value={squadBirthYear} onChange={e=>setSquadBirthYear(e.target.value)} placeholder="2014"/></label>
              </div>
            )}
            <div className="assignment-grid"><label><span>Categoria e competizione</span><select value={`${category}|${division}`} onChange={e=>{const [nextCategory,nextDivision]=e.target.value.split("|");setCategory(nextCategory);setDivision(nextDivision);if(addMode==="new"){setSquadName(nextCategory);setSquadBirthYear(/^\d{4}$/.test(nextCategory)?nextCategory:"")}}}>{availableCompetitions.map(item=><option key={`${item.category}|${item.division}`} value={`${item.category}|${item.division}`}>{item.category} · {item.division}</option>)}</select></label></div>
            <footer>
              <button className="ghost-button" onClick={() => setAddMode(null)}>
                Annulla
              </button>
              <button
                className="gold-button"
                disabled={
                  saving ||
                  (addMode === "directory"
                    ? teamIds.length === 0
                    : name.trim().length < 3)
                }
                onClick={addTeam}
              >
                {saving
                  ? "Salvataggio…"
                  : addMode === "directory"
                    ? `Invita ${teamIds.length} squadre`
                    : "Crea società e prima squadra"}
              </button>
            </footer>
          </section>
        </div>
      )}
      {profileTeamId && (
        <TeamProfileDrawer
          teamId={profileTeamId}
          onClose={() => {setProfileTeamId(null);void load()}}
          notify={notify}
        />
      )}{" "}
      {selectedMatch && (
        <OperationalMatchDrawer
          matchId={selectedMatch.id}
          onClose={() => setSelectedMatch(null)}
          onChanged={load}
          notify={notify}
        />
      )}
      {creatingMatch && (
        <CreateMatchDrawer
          teams={data.teams}
          referees={data.referees || []}
          fields={data.fields || []}
          scheduleConfig={data.scheduleConfig}
          saving={saving}
          onClose={() => setCreatingMatch(false)}
          onCreate={(payload) =>
            void action(payload, "Partita creata e controllata").then((ok) => {
              if (ok) setCreatingMatch(false);
            })
          }
        />
      )}
    </>
  );
}

function PublicStories({ tournamentId }: { tournamentId: string }) {
  const [data, setData] = useState<{
    posts: EditorialPost[];
    awards: AwardEntry[];
  } | null>(null),[selectedStory,setSelectedStory]=useState<EditorialPost|null>(null);
  useEffect(() => {
    let active = true;
    fetch(`/api/public/tournaments/${tournamentId}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => {
        if (active) setData({ posts: body.posts || [], awards: body.awards || [] });
      })
      .catch(() => {
        if (active) setData({ posts: [], awards: [] });
      });
    return () => { active = false; };
  }, [tournamentId]);
  if (!data)
    return <div className="public-media-loading">Caricamento storie e protagonisti…</div>;
  return (
    <>
      <section className="public-news">
        <header>
          <div><p className="eyebrow">Dentro il campo</p><h2>Storie, voci, emozioni</h2></div>
          <span>News · Interviste · Video</span>
        </header>
        <div>
          {data.posts.length ? data.posts.slice(0, 6).map((post, index) => (
            <article className={index === 0 ? "featured" : ""} key={post.id} role="button" tabIndex={0} onClick={()=>setSelectedStory(post)} onKeyDown={event=>{if(event.key==="Enter")setSelectedStory(post)}}>
              {post.mediaKey ? (isVideoMedia(post.mediaKey)?<video src={mediaUrl(post.mediaKey)} controls preload="metadata"/>:<img src={mediaUrl(post.mediaKey)} alt="" />) : <div className="story-art">{post.type === "interview" ? <Mic2 /> : post.type === "video" ? <Video /> : <Newspaper />}</div>}
              <span>{post.type}{post.teamName ? ` · ${post.teamName}` : ""}</span>
              <h3>{post.title}</h3><p>{post.excerpt || post.body}</p>
              {post.videoUrl && <a href={post.videoUrl} target="_blank" rel="noreferrer"><Video /> Guarda il video</a>}
            </article>
          )) : <div className="public-empty"><Newspaper /><b>La stagione sta per iniziare</b><p>Interviste, racconti e immagini delle giornate appariranno qui.</p></div>}
        </div>
      </section>
      {selectedStory&&<div className="content-preview-layer public-story-layer"><article className="content-preview"><button className="icon-button" onClick={()=>setSelectedStory(null)}><X/></button>{selectedStory.mediaKey&&(isVideoMedia(selectedStory.mediaKey)?<video src={mediaUrl(selectedStory.mediaKey)} controls/>:<img src={mediaUrl(selectedStory.mediaKey)} alt=""/>)}<span>{selectedStory.type}{selectedStory.teamName?" · "+selectedStory.teamName:""}</span><h2>{selectedStory.title}</h2><p className="content-preview-lead">{selectedStory.excerpt}</p><div>{selectedStory.body}</div>{selectedStory.videoUrl&&<a className="gold-button" href={selectedStory.videoUrl} target="_blank" rel="noreferrer"><Video/> Guarda il video</a>}</article></div>}
      <section className="public-awards">
        <header><div><p className="eyebrow">Future Stars Awards</p><h2>I protagonisti</h2></div><Trophy /></header>
        <div>
          {data.awards.length ? data.awards.slice(0, 8).map((award, index) => (
            <article key={award.id} style={{ "--award-index": index } as React.CSSProperties}>
              {award.mediaKey ? <img src={mediaUrl(award.mediaKey)} alt="" /> : <div className="award-card-art"><AwardBadge type={award.type}/><strong>{award.recipientName.split(" ").map((value) => value[0]).join("").slice(0, 2)}</strong></div>}
              <small>{award.scope} · {award.type}</small><h3>{award.title}</h3><b>{award.recipientName}</b><p>{award.note}</p>
            </article>
          )) : <div className="public-empty"><Trophy /><b>Ogni giornata avrà i suoi protagonisti</b><p>I premi ufficiali verranno pubblicati dopo la valutazione della giuria.</p></div>}
        </div>
      </section>
    </>
  );
}

function PublicMatchDrawer({match,onClose}:{match:any;onClose:()=>void}){
  const labels:Record<string,string>={goal:"Gol",own_goal:"Autogol",yellow_card:"Ammonizione",red_card:"Espulsione",mvp:"MVP"},official=["official","rectified"].includes(match.status);
  return <div className="drawer-layer" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><aside className="match-drawer public-match-detail"><header><div><p className="eyebrow">{match.competitionName||"Campionato"} · {match.roundName||`Giornata ${match.matchDay}`} · {match.category} {match.division}</p><h2>Dettaglio partita</h2></div><button className="icon-button" onClick={onClose}><X/></button></header><section className="public-match-score"><span><ClubBadge initials={match.homeShort} color="red"/><b>{match.home}</b></span><strong>{official?`${match.homeScore??0} – ${match.awayScore??0}`:"VS"}{official&&match.homePenaltyScore!=null&&match.awayPenaltyScore!=null?<small>Rigori {match.homePenaltyScore}–{match.awayPenaltyScore}</small>:null}</strong><span><ClubBadge initials={match.awayShort} color="blue"/><b>{match.away}</b></span></section><div className="match-info-grid"><div><CalendarDays/><span><small>Data e ora</small><b>{new Date(match.startsAt).toLocaleString("it-IT",{weekday:"long",day:"2-digit",month:"long",hour:"2-digit",minute:"2-digit"})}</b></span></div><div><MapPin/><span><small>Impianto</small><b>{match.venue} · {match.field}</b></span></div><div><Flag/><span><small>Arbitro</small><b>{match.refereeName||"Da assegnare"}</b></span></div><div><ShieldCheck/><span><small>Stato</small><b>{matchStatusLabel[match.status]||match.status}</b></span></div></div><section className="public-timeline"><header><div><p className="eyebrow">Tabellino ufficiale</p><h3>Episodi della gara</h3></div><ListPlus/></header>{match.events?.length?match.events.map((event:any)=><article key={event.id}><time>{event.minute>0?`${event.minute}′`:""}</time><i className={`event-symbol event-${event.type}`}>{event.type==="mvp"?<Trophy/>:event.type.includes("card")?<span/>:<strong>⚽</strong>}</i><span><b>{labels[event.type]||event.type} · {event.playerName}</b><small>{event.teamId===match.homeTeamId?match.home:match.away}</small></span></article>):<div className="events-empty"><Clock3/><b>Episodi non ancora disponibili</b><span>Gol e cartellini appariranno dal tabellino ufficiale.</span></div>}</section></aside></div>
}

function PublicBracket({matches,onOpen}:{matches:any[];onOpen:(match:any)=>void}){
  const rounds=[...new Set(matches.map(match=>match.bracketRound||1))].sort((a,b)=>a-b);
  return <section className="public-bracket"><header><div><p className="eyebrow">Road to the final</p><h2>Tabellone fase finale</h2></div><Trophy/></header><div className="bracket-rounds">{rounds.map(round=><div className="bracket-round" key={round}><h5>{matches.find(match=>(match.bracketRound||1)===round)?.roundName?.replace(/ · (andata|ritorno)$/i,"")||`Turno ${round}`}</h5>{[...new Set(matches.filter(match=>(match.bracketRound||1)===round).map(match=>match.bracketTieId||match.id))].map(tie=><article key={tie}>{matches.filter(match=>(match.bracketTieId||match.id)===tie).map(match=><button key={match.id} onClick={()=>onOpen(match)}><span><b>{match.home}</b><em>{["official","rectified"].includes(match.status)?match.homeScore??0:"–"}</em></span><span><b>{match.away}</b><em>{["official","rectified"].includes(match.status)?match.awayScore??0:"–"}</em></span><small>{match.stage==="placement"?"Finale 3° posto":match.roundName}</small></button>)}</article>)}</div>)}</div></section>
}

function loadGraphicImage(src:string){return new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.crossOrigin="anonymous";image.onload=()=>resolve(image);image.onerror=reject;image.src=src})}
async function matchGraphic(match:any,homeScore:number,awayScore:number,mvp:any,top:any[],awards:AwardEntry[],share:boolean){
  const canvas=document.createElement("canvas");canvas.width=1080;canvas.height=1350;const ctx=canvas.getContext("2d");if(!ctx)return;
  ctx.fillStyle="#031321";ctx.fillRect(0,0,1080,1350);
  try{const image=await loadGraphicImage("/experience/celebration.webp"),scale=Math.max(canvas.width/image.width,canvas.height/image.height),width=image.width*scale,height=image.height*scale;ctx.globalAlpha=.38;ctx.drawImage(image,(canvas.width-width)/2,(canvas.height-height)/2,width,height);ctx.globalAlpha=1}catch{}
  const shade=ctx.createLinearGradient(0,0,0,1350);shade.addColorStop(0,"rgba(3,16,28,.28)");shade.addColorStop(.42,"rgba(3,16,28,.78)");shade.addColorStop(1,"rgba(2,12,22,.98)");ctx.fillStyle=shade;ctx.fillRect(0,0,1080,1350);
  const homeColor=match.homeColor||"#e54835",awayColor=match.awayColor||"#1778ff";ctx.fillStyle=homeColor;ctx.fillRect(0,0,18,1350);ctx.fillStyle=awayColor;ctx.fillRect(1062,0,18,1350);
  const text=(value:string,x:number,y:number,font:string,color:string,align:CanvasTextAlign="left")=>{ctx.font=font;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(value,x,y)};
  const clipped=(value:string,max:number)=>value.length>max?`${value.slice(0,max-1)}…`:value;
  text("FUTURE STARS LEAGUE",540,82,"900 30px Arial","#f4b73e","center");text(`${match.tournamentName} · ${match.tournamentEdition} · ${match.category} ${match.division}`,540,122,"700 21px Arial","#c7d7e3","center");
  ctx.fillStyle="rgba(4,25,42,.84)";ctx.beginPath();ctx.roundRect(70,180,940,330,40);ctx.fill();ctx.strokeStyle="rgba(255,255,255,.14)";ctx.lineWidth=2;ctx.stroke();
  const club=(x:number,color:string,shortName:string,name:string)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,285,68,0,Math.PI*2);ctx.fill();text(clipped(shortName||"FS",5),x,297,"900 32px Arial","#fff","center");text(clipped(name.toUpperCase(),18),x,407,"900 28px Arial","#fff","center")};club(250,homeColor,match.homeShort,match.home);club(830,awayColor,match.awayShort,match.away);
  text(String(homeScore),455,345,"900 112px Arial","#fff","center");text("–",540,338,"700 70px Arial","#f4b73e","center");text(String(awayScore),625,345,"900 112px Arial","#fff","center");text("RISULTATO FINALE",540,468,"900 18px Arial","#8fa8ba","center");
  ctx.fillStyle="rgba(6,31,51,.92)";ctx.beginPath();ctx.roundRect(70,550,940,385,40);ctx.fill();ctx.strokeStyle="rgba(244,183,62,.46)";ctx.stroke();
  text("MVP DELLA PARTITA",120,625,"900 24px Arial","#f4b73e");text(clipped(`${mvp.firstName} ${mvp.lastName}`.toUpperCase(),24),120,725,"900 67px Arial","#fff");text(`${mvp.teamName} · #${mvp.shirtNumber??"—"} · ${mvp.role||"Giocatore"}`,120,775,"700 25px Arial","#a9bdcc");text(formatRating(mvp.finalRatingTenths/10),120,880,"900 92px Arial","#f4b73e");text("FANTASY RATING",350,872,"900 22px Arial","#fff");
  text("TOP DELLA GARA",75,1005,"900 22px Arial","#f4b73e");top.slice(0,3).forEach((player,index)=>{const y=1065+index*70;ctx.fillStyle="rgba(13,52,82,.78)";ctx.beginPath();ctx.roundRect(75,y-42,930,56,16);ctx.fill();text(String(index+1),105,y-3,"900 23px Arial","#7894a8","center");text(clipped(`${player.firstName} ${player.lastName}`,28),145,y-3,"800 24px Arial","#fff");text(player.teamName,650,y-3,"700 19px Arial","#8fa8ba");text(formatRating(player.finalRatingTenths/10),960,y-3,"900 30px Arial","#f4b73e","right")});
  if(awards.length)text(clipped(awards.slice(0,2).map(award=>`${award.title}: ${award.recipientName}`).join("  ·  "),70),75,1302,"700 18px Arial","#c7d7e3");else text("Ogni partita diventa una storia da condividere.",75,1302,"700 18px Arial","#8fa8ba");
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/png",.96));if(!blob)return;const safe=`${match.home}-${match.away}`.replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"");const file=new File([blob],`FSL-${safe}.png`,{type:"image/png"});
  if(share&&navigator.share&&navigator.canShare?.({files:[file]})){try{await navigator.share({title:`${match.home} ${homeScore}-${awayScore} ${match.away}`,text:`Risultato ufficiale · ${match.tournamentName}`,files:[file]});return}catch(error){if((error as Error)?.name==="AbortError")return}}
  const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=file.name;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function playerGraphic(player:any,tournament:any,day:number){
  const canvas=document.createElement("canvas");canvas.width=1080;canvas.height=1350;const ctx=canvas.getContext("2d");if(!ctx)return;
  const background=player.modifiers?.includes("saved_penalty")?"/experience/goalkeeper.webp":player.modifiers?.includes("goal")?"/experience/celebration.webp":"/experience/awards.webp";
  const image=await loadGraphicImage(background),scale=Math.max(canvas.width/image.width,canvas.height/image.height),width=image.width*scale,height=image.height*scale;ctx.drawImage(image,(canvas.width-width)/2,(canvas.height-height)/2,width,height);
  const shade=ctx.createLinearGradient(0,0,0,1350);shade.addColorStop(0,"rgba(3,20,34,.18)");shade.addColorStop(.48,"rgba(3,20,34,.46)");shade.addColorStop(1,"rgba(3,14,25,.97)");ctx.fillStyle=shade;ctx.fillRect(0,0,1080,1350);ctx.fillStyle=player.teamColor||"#1778ff";ctx.fillRect(0,0,18,1350);
  ctx.fillStyle="#f4b73e";ctx.font="800 28px Arial";ctx.fillText("FUTURE STARS LEAGUE",72,90);ctx.fillStyle="#d7e5ef";ctx.font="700 22px Arial";ctx.fillText(`${tournament.name} · ${tournament.edition} · GIORNATA ${day}`,72,132);
  ctx.fillStyle="rgba(4,25,42,.82)";ctx.beginPath();ctx.roundRect(64,760,952,500,38);ctx.fill();ctx.strokeStyle="rgba(244,183,62,.48)";ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle="#f4b73e";ctx.font="900 34px Arial";ctx.fillText("MVP DI GIORNATA",110,835);ctx.fillStyle="#ffffff";ctx.font="900 76px Arial";const name=String(player.playerName||"FUTURE STAR").toUpperCase();ctx.fillText(name.length>22?`${name.slice(0,21)}…`:name,110,940);ctx.fillStyle="#b9cbda";ctx.font="700 30px Arial";ctx.fillText(`${player.teamName} · #${player.shirtNumber??"—"} · ${player.role||"Giocatore"}`,110,995);
  ctx.fillStyle="#f4b73e";ctx.font="900 124px Arial";ctx.fillText((Number(player.finalRatingTenths||60)/10).toFixed(1).replace(".",","),110,1145);ctx.fillStyle="#ffffff";ctx.font="800 26px Arial";ctx.fillText("FANTASY RATING",110,1182);ctx.fillStyle="#8da6b9";ctx.font="600 22px Arial";ctx.fillText("Voto tecnico + bonus e malus del referto ufficiale",110,1225);
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/png",.95));if(!blob)return;const file=new File([blob],`FSL-MVP-G${day}-${player.playerName.replace(/\s+/g,"-")}.png`,{type:"image/png"});
  if(navigator.share&&navigator.canShare?.({files:[file]})){try{await navigator.share({title:`MVP Giornata ${day}`,text:`${player.playerName} · Future Stars League`,files:[file]})}catch(error){if((error as Error)?.name!=="AbortError")throw error}}else{const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=file.name;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000)}
}

function FutureStarsPreview(){
  const positions=[["9","ATT"],["7","ALA"] , ["10","CEN"],["8","MED"],["4","DIF"],["5","DIF"],["1","POR"]];
  return <section className="experience-preview"><div className="experience-preview__copy"><span>ANTEPRIMA DEMO · NESSUN DATO UFFICIALE</span><p className="eyebrow">Future Stars Experience</p><h2>Ogni referto diventa spettacolo.</h2><p>Questa anteprima mostra il formato. Dopo l’ufficializzazione dei voti appariranno soltanto atleti pubblicabili, media reali, Top Team e card social generate dalla gara.</p><div><b><Star/> MVP DI GIORNATA</b><b><BarChart3/> POWER RANKING</b><b><Medal/> BADGE DINAMICI</b></div></div><div className="experience-preview__visual"><article><small>CARD SOCIAL AUTOMATICA</small><h3>IL PROTAGONISTA<br/>SEI TU.</h3><strong>8,5</strong><em>FANTASY RATING · DEMO</em></article><section><header><span>TOP TEAM</span><b>7 PROTAGONISTI</b></header><div>{positions.map(([number,role],index)=><i key={`${number}-${role}`} style={{left:`${[50,72,31,63,38,66,50][index]}%`,top:`${[12,25,37,42,62,66,82][index]}%`}}><b>{number}</b><small>{role}</small></i>)}</div></section></div></section>;
}

function FutureStarsExperience({ratings,tournament,badges=[]}:{ratings:FantasyRating[];tournament:any;badges?:AwardEntry[]}){
  const latestDay=ratings.reduce((value,row)=>Math.max(value,Number(row.matchDay)||0),0),latest=ratings.filter(row=>Number(row.matchDay)===latestDay).sort((a,b)=>b.finalRatingTenths-a.finalRatingTenths),mvp=latest[0];
  const leaders=[...ratings.reduce((map,row)=>{const current=map.get(row.playerId)||{...row,total:0,ratedMatches:0,best:0};current.total+=Number(row.finalRatingTenths);current.ratedMatches++;current.best=Math.max(current.best,Number(row.finalRatingTenths));map.set(row.playerId,current);return map},new Map<string,any>()).values()].map(row=>({...row,averageRating:row.total/row.ratedMatches/10})).sort((a,b)=>b.averageRating-a.averageRating||b.best-a.best);
  const topCount=/201[45]/.test(String(ratings[0]?.category||""))?9:Math.min(9,Math.max(7,latest.length)),chosen:any[]=[];const take=(filter:(row:any)=>boolean,count:number)=>{for(const row of latest.filter(filter)){if(chosen.length>=topCount||chosen.filter(filter).length>=count)break;if(!chosen.some(value=>value.playerId===row.playerId))chosen.push(row)}};take(row=>/port|goal/i.test(row.role||""),1);take(row=>/dif|terz|centrale/i.test(row.role||""),topCount===7?2:3);take(row=>/cent|med|estern/i.test(row.role||""),topCount===7?2:3);take(row=>/att|punt|ala/i.test(row.role||""),2);for(const row of latest)if(chosen.length<topCount&&!chosen.some(value=>value.playerId===row.playerId))chosen.push(row);
  const line=(filter:(row:any)=>boolean)=>chosen.filter(filter),keepers=line(row=>/port|goal/i.test(row.role||"")),defenders=line(row=>/dif|terz|centrale/i.test(row.role||"")),midfielders=line(row=>/cent|med|estern/i.test(row.role||"")),attackers=chosen.filter(row=>![...keepers,...defenders,...midfielders].some(value=>value.playerId===row.playerId));
  const playerBadges=(playerId:string)=>badges.filter(badge=>badge.playerId===playerId);
  const playerButton=(row:any)=><button key={row.playerId} onClick={()=>{window.location.href=`${window.location.pathname}?player=${row.playerId}`}}><span>{row.photoKey?<img src={mediaUrl(row.photoKey)} alt=""/>:row.shirtNumber??"FS"}</span><b>{row.playerName}<small>{row.teamShort}</small></b><em>{formatRating(row.finalRatingTenths/10)}</em></button>;
  if(!ratings.length)return <FutureStarsPreview/>;
  return <section className="experience-zone"><header><div><p className="eyebrow">Future Stars Experience</p><h2>La giornata prende vita</h2></div><span><Zap/> Aggiornata dai referti ufficiali</span></header><div className="experience-grid">
    <article className="mvp-spotlight" style={{backgroundImage:`linear-gradient(90deg,rgba(2,18,31,.94),rgba(2,18,31,.2)),url(${mvp?.modifiers?.includes("saved_penalty")?"/experience/goalkeeper.webp":"/experience/celebration.webp"})`}}><div><span>MVP · GIORNATA {latestDay}</span><h3>{mvp.playerName}</h3><p>{mvp.teamName} · {mvp.role}</p><strong>{formatRating(mvp.finalRatingTenths/10)}<small>FANTASY RATING</small></strong><div>{playerBadges(mvp.playerId).slice(0,3).map(badge=><AwardBadge key={badge.id} type={badge.type}/>)}</div><button onClick={()=>void playerGraphic(mvp,tournament,latestDay)}><Download/> Crea e condividi la card</button></div></article>
    <article className="fantasy-leaderboard"><header><div><small>POWER RANKING</small><h3>Media voto fantasy</h3></div><BarChart3/></header>{leaders.slice(0,6).map((row,index)=><button key={row.playerId} onClick={()=>{window.location.href=`${window.location.pathname}?player=${row.playerId}`}}><strong>{index+1}</strong><span>{row.photoKey?<img src={mediaUrl(row.photoKey)} alt=""/>:row.shirtNumber??"FS"}</span><div><b>{row.playerName}</b><small>{row.teamName} · {row.ratedMatches} voti</small></div><em>{row.averageRating.toFixed(2).replace(".",",")}</em></button>)}</article>
  </div><article className="top-team"><header><div><small>BEST OF THE ROUND</small><h3>Top Team · Giornata {latestDay}</h3></div><span>{chosen.length} protagonisti</span></header><div className="fantasy-pitch">{[attackers,midfielders,defenders,keepers].map((players,index)=><div className={`formation-line line-${index}`} key={index}>{players.map(playerButton)}</div>)}</div></article>
  <article className="badge-wall"><header><div><small>BADGE UFFICIALI</small><h3>Traguardi conquistati sul campo</h3></div><Medal/></header><div>{leaders.filter(row=>playerBadges(row.playerId).length>0).slice(0,5).map(row=><button key={row.playerId} onClick={()=>{window.location.href=`${window.location.pathname}?player=${row.playerId}`}}><span>{row.photoKey?<img src={mediaUrl(row.photoKey)} alt=""/>:row.shirtNumber??"FS"}</span><div><b>{row.playerName}</b><small>{row.teamName}</small><em>{playerBadges(row.playerId).slice(0,4).map(badge=><AwardBadge compact key={badge.id} type={badge.type}/>)}</em></div><ChevronRight/></button>)}</div></article></section>
}

function PublicHonours({rows}:{rows:any[]}){
  if(!rows.length)return null;const teams=[...new Map(rows.map(row=>[row.teamId,row])).values()];
  return <section className="public-honours"><header><div><p className="eyebrow">Albo d’oro</p><h2>Traguardi della stagione</h2></div><Medal/></header><div>{teams.map(team=><article key={team.teamId} style={{"--club":team.primaryColor} as React.CSSProperties}><i>{team.crestKey?<img src={mediaUrl(team.crestKey)} alt=""/>:team.shortName}</i><span><small>{team.competitionName} · {team.category} {team.division}</small><h3>{team.teamName}</h3><div>{rows.filter(row=>row.teamId===team.teamId).map(row=><SeasonBadge key={row.id} outcome={row.outcome}/>)}</div></span></article>)}</div></section>
}

function ConnectedPublicScreen({tournamentId}:{tournamentId:string}){
  const [data,setData]=useState<any>(null),[category,setCategory]=useState(""),[selected,setSelected]=useState<any>(null);
  useEffect(()=>{let active=true;fetch(`/api/public/tournaments/${tournamentId}`,{cache:"no-store"}).then(async response=>{const body=await response.json();if(!response.ok)throw new Error();if(active){setData(body);if(!category&&body.categories?.[0])setCategory(body.categories[0].id)}}).catch(()=>active&&setData({error:true}));return()=>{active=false}},[tournamentId]);
  if(!data)return <div className="workspace-loading">Caricamento campionato…</div>;
  if(data.error)return <div className="team-empty"><AlertTriangle/><h3>Portale momentaneamente non disponibile</h3><p>Riprova tra qualche istante.</p></div>;
  const categories=data.categories||[],selectedCompetition=categories.find((item:any)=>item.id===category)||categories[0],filteredMatches=(data.matches||[]).filter((match:any)=>!category||match.competitionId===category||(!match.competitionId&&match.category===selectedCompetition?.category&&match.division===selectedCompetition?.division)),table=(data.standings||[]).filter((row:any)=>!category||row.competitionId===category),bracketMatches=filteredMatches.filter((match:any)=>["finals","placement","playout"].includes(match.stage)),honours=(data.outcomes||[]).filter((row:any)=>!category||row.competitionId===category),fantasyRatings=(data.fantasyRatings||[]).filter((row:any)=>!category||row.competitionId===category),next=filteredMatches.find((match:any)=>new Date(match.startsAt)>=new Date())||filteredMatches[0],scorers=data.scorers||[];
  return <div className="public-view"><section className="league-hero"><div className="league-hero__content"><span className="league-kicker">{data.tournament.name} · {data.tournament.edition}</span><h2>LA SERIE A<br/><em>DEI BAMBINI</em></h2><p>Risultati, protagonisti e storie aggiornati direttamente dai referti ufficiali.</p><a className="gold-button" href="#public-matches"><CalendarDays size={18}/> Scopri le partite</a></div>{next?<button className="league-hero__score" onClick={()=>setSelected(next)}><small>PROSSIMO MATCH · {new Date(next.startsAt).toLocaleDateString("it-IT",{weekday:"short",day:"2-digit",month:"short"}).toUpperCase()}</small><div><ClubBadge initials={next.homeShort} color="red"/><strong>{new Date(next.startsAt).toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})}</strong><ClubBadge initials={next.awayShort} color="blue"/></div><b>{next.home} <i>VS</i> {next.away}</b><span><MapPin size={15}/> {next.venue} · {next.field}</span></button>:<div className="league-hero__score"><CalendarDays/><b>Calendario in preparazione</b></div>}</section>
    <div className="public-filter"><div><Status tone="green">Dati ufficiali</Status><h3>Il torneo, adesso</h3></div><select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map((item:any)=><option value={item.id} key={item.id}>{item.name} · {item.category} · {item.division}</option>)}</select></div>
    <div className="public-grid" id="public-matches"><section className="panel matches-panel"><div className="panel__head"><div><p className="eyebrow">Calendario reale</p><h3>Partite</h3></div><CalendarDays/></div>{filteredMatches.length?filteredMatches.slice(0,10).map((match:any)=>{const date=new Date(match.startsAt),official=["official","rectified"].includes(match.status);return <button className="match-row" key={match.id} onClick={()=>setSelected(match)}><time>{date.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})}<small>{date.toLocaleDateString("it-IT",{weekday:"short",day:"2-digit"}).toUpperCase()}</small></time><div className="match-teams"><span><ClubBadge initials={match.homeShort} color="red"/>{match.home}</span><i>{official?`${match.homeScore??0}–${match.awayScore??0}`:"—"}</i><span>{match.away}<ClubBadge initials={match.awayShort} color="blue"/></span></div><div className="match-meta"><b>{match.field}</b><small>G{match.matchDay} · {match.category} {match.division}</small></div><ChevronRight/></button>}):<div className="public-empty"><CalendarDays/><b>Nessuna partita inserita</b><p>Le gare appariranno appena il calendario sarà creato.</p></div>}</section>
      <section className="panel standings-panel"><div className="panel__head"><div><p className="eyebrow">Classifica ufficiale</p><h3>{selectedCompetition?.name} · {selectedCompetition?.category} · {selectedCompetition?.division}</h3></div><BarChart3/></div><div className="standing-head"><span>#</span><span>Squadra</span><span>PG</span><span>DR</span><b>PT</b></div>{selectedCompetition?.kind==="knockout"?<div className="public-empty"><Trophy/><b>Tabellone a eliminazione diretta</b><p>Segui gli incontri nella sezione partite.</p></div>:table.length?table.map((row:any,index:number)=><div className="standing-row" key={row.id}><span>{index+1}</span><span><ClubBadge initials={row.shortName} color={index===0?"gold":"blue"}/>{row.name}</span><span>{row.played}</span><span>{Number(row.gf)-Number(row.ga)>0?"+":""}{Number(row.gf)-Number(row.ga)}</span><b>{row.points}</b></div>):<div className="public-empty"><BarChart3/><b>Classifica in attesa</b><p>Si aggiornerà al primo risultato ufficiale.</p></div>}</section>
      <section className="panel scorer-panel"><div className="panel__head"><div><p className="eyebrow">Statistiche da referto</p><h3>Marcatori</h3></div><Trophy/></div>{scorers.length?scorers.slice(0,8).map((player:any,index:number)=><div className="scorer-row" key={player.playerId}><strong>{index+1}</strong><span className="player-avatar">{player.photoKey?<img src={mediaUrl(player.photoKey)} alt=""/>:player.playerName.split(" ").map((value:string)=>value[0]).join("").slice(0,2)}</span><div><b>{player.playerName}</b><small>{player.teamName} · {player.assists} assist</small></div><em>{player.goals}<small>GOL</small></em></div>):<div className="public-empty"><Trophy/><b>Marcatori in attesa</b><p>Servono referti ufficiali e consenso alla pubblicazione del profilo.</p></div>}</section></div><FutureStarsExperience ratings={fantasyRatings} tournament={data.tournament} badges={data.badges||[]}/>{bracketMatches.length>0&&<PublicBracket matches={bracketMatches} onOpen={setSelected}/>}<PublicHonours rows={honours}/><PublicStories tournamentId={tournamentId}/>{selected&&<PublicMatchDrawer match={selected} onClose={()=>setSelected(null)}/>}</div>
}

function PublicScreen({ tournamentId, notify }: { tournamentId: string; notify: (v: string) => void }) {
  const [category, setCategory] = useState("2014 · Serie A");
  const [selected, setSelected] = useState<MatchDetail | null>(null);
  function openDemo(m: (typeof matches)[number], index: number) {
    setSelected({
      id: `demo-${index}`,
      homeTeamId: `demo-home-${index}`,
      awayTeamId: `demo-away-${index}`,
      tournamentName: "Future Stars League",
      tournamentEdition: "2026/27",
      home: m.home,
      homeShort: m.home
        .split(" ")
        .map((v) => v[0])
        .join(""),
      away: m.away,
      awayShort: m.away
        .split(" ")
        .map((v) => v[0])
        .join(""),
      category: m.category.split(" · ")[0],
      division: m.category.split(" · ")[1],
      matchDay: 9,
      startsAt: `2026-10-10T${m.time}:00+02:00`,
      venue: "Future Arena",
      field: m.field,
      refereeName: index === 0 ? "Marco Esposito" : "Da assegnare",
      status: "scheduled",
      callups:
        index === 0
          ? {
              home: [
                "Luca Ferri #9",
                "Matteo Rinaldi #10",
                "Andrea Conti #6",
                "Diego Moretti #4",
                "Nicolò Bassi #7",
                "Simone Greco #1",
                "Alessio Romano #11",
                "Davide Serra #8",
                "Edoardo Galli #3",
                "Tommaso De Angelis #5",
                "Marco Vitale #2",
                "Gabriele Fontana #12",
                "Riccardo Leone #14",
                "Pietro Amato #15",
              ],
              away: [
                "Marco Belli #9",
                "Filippo Russo #10",
                "Leonardo Costa #7",
                "Samuele Ricci #4",
                "Giorgio Esposito #6",
                "Mattia Bruno #1",
                "Alessandro Villa #11",
                "Manuel Longo #8",
                "Lorenzo Riva #3",
                "Christian Marchetti #5",
                "Jacopo Testa #2",
                "Daniele Fiore #12",
                "Federico Sala #14",
                "Niccolò Palmieri #15",
              ],
            }
          : { home: [], away: [] },
    });
  }
  return (
    <div className="public-view">
      <section className="league-hero">
        <div className="league-hero__content">
          <span className="league-kicker">FUTURE STARS LEAGUE · 2026/27</span>
          <h2>
            LA SERIE A<br />
            <em>DEI BAMBINI</em>
          </h2>
          <p>
            Talento, appartenenza, emozioni. Ogni weekend diventa una storia da
            ricordare.
          </p>
          <button
            className="gold-button"
            onClick={() =>
              notify("Calendario completo disponibile nella prossima versione")
            }
          >
            <CalendarDays size={18} /> Scopri le partite
          </button>
        </div>
        <div className="league-hero__score">
          <small>PROSSIMO MATCH · SAB 10 OTT</small>
          <div>
            <ClubBadge initials="RN" color="red" />
            <strong>08:30</strong>
            <ClubBadge initials="SE" color="blue" />
          </div>
          <b>
            ROMA NORD <i>VS</i> SPORTING EUR
          </b>
          <span>
            <MapPin size={15} /> Future Arena · Campo 1
          </span>
        </div>
      </section>
      <div className="public-filter">
        <div>
          <Status tone="green">Live data</Status>
          <h3>Il campionato, adesso</h3>
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option>2014 · Serie A</option>
          <option>2014 · Serie B</option>
          <option>2015 · Serie A</option>
          <option>2016 · Serie A</option>
          <option>2017 · Serie A</option>
        </select>
      </div>
      <div className="public-grid">
        <section className="panel matches-panel">
          <div className="panel__head">
            <div>
              <p className="eyebrow">Giornata 9</p>
              <h3>Prossime partite</h3>
            </div>
            <button
              onClick={() => notify("Calendario completo in preparazione")}
            >
              Tutte
            </button>
          </div>
          {matches.map((m, i) => (
            <button
              className="match-row"
              key={m.time}
              onClick={() => openDemo(m, i)}
            >
              <time>
                {m.time}
                <small>SAB 10</small>
              </time>
              <div className="match-teams">
                <span>
                  <ClubBadge
                    initials={m.home
                      .split(" ")
                      .map((v) => v[0])
                      .join("")}
                    color={i === 0 ? "red" : "gold"}
                  />
                  {m.home}
                </span>
                <i>—</i>
                <span>
                  {m.away}
                  <ClubBadge
                    initials={m.away
                      .split(" ")
                      .map((v) => v[0])
                      .join("")}
                    color={i === 1 ? "green" : "blue"}
                  />
                </span>
              </div>
              <div className="match-meta">
                <b>{m.field}</b>
                <small>{m.category}</small>
              </div>
              <ChevronRight />
            </button>
          ))}
        </section>
        <section className="panel standings-panel">
          <div className="panel__head">
            <div>
              <p className="eyebrow">Classifica</p>
              <h3>{category}</h3>
            </div>
            <BarChart3 />
          </div>
          <div className="standing-head">
            <span>#</span>
            <span>Squadra</span>
            <span>PG</span>
            <span>DR</span>
            <b>PT</b>
          </div>
          {standings.map((r, i) => (
            <div className="standing-row" key={String(r[0])}>
              <span>{i + 1}</span>
              <span>
                <ClubBadge
                  initials={String(r[0])
                    .split(" ")
                    .map((v) => v[0])
                    .join("")}
                  color={i === 0 ? "red" : i === 1 ? "gold" : "blue"}
                />
                {r[0]}
              </span>
              <span>{r[1]}</span>
              <span>{r[2]}</span>
              <b>{r[3]}</b>
            </div>
          ))}
        </section>
        <section className="panel scorer-panel">
          <div className="panel__head">
            <div>
              <p className="eyebrow">Top player</p>
              <h3>Marcatori</h3>
            </div>
            <Trophy />
          </div>
          {scorers.map((s, i) => (
            <div className="scorer-row" key={String(s[0])}>
              <strong>{i + 1}</strong>
              <span className="player-avatar">{s[3]}</span>
              <div>
                <b>{s[0]}</b>
                <small>{s[1]}</small>
              </div>
              <em>
                {s[2]}
                <small>GOL</small>
              </em>
            </div>
          ))}
        </section>
      </div>
      <PublicStories tournamentId={tournamentId} />
      {selected && (
        <MatchDrawer match={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function ControlScreen({ notify }: { notify: (v: string) => void }) {
  const slots = ["08:30", "09:10", "09:50", "10:30"];
  const fieldNames = ["CAMPO 1", "CAMPO 2", "CAMPO 3"];
  return (
    <>
      <section className="page-intro">
        <div>
          <Status tone="green">Operativo</Status>
          <h2>Sabato 10 ottobre</h2>
          <p>42 gare previste nel weekend · 3 campi attivi</p>
        </div>
        <div className="intro-actions">
          <button
            className="ghost-button"
            onClick={() => notify("Esportazione report avviata")}
          >
            <FileCheck2 size={18} /> Report giornata
          </button>
          <button
            className="gold-button"
            onClick={() => notify("Calendario pubblicato alle società")}
          >
            <Radio size={18} /> Pubblica aggiornamenti
          </button>
        </div>
      </section>
      <section className="metric-grid control-metrics">
        <article>
          <span>GARE OGGI</span>
          <strong>21</strong>
          <small>7 per campo</small>
        </article>
        <article>
          <span>IN CORSO</span>
          <strong className="green-number">3</strong>
          <small>Aggiornamento live</small>
        </article>
        <article>
          <span>REFERTI ATTESI</span>
          <strong>6</strong>
          <small>
            <b>2</b> da verificare
          </small>
        </article>
        <article>
          <span>SEGNALAZIONI</span>
          <strong>2</strong>
          <small>Nessuna critica</small>
        </article>
      </section>
      <div className="control-layout">
        <section className="fields-board">
          <div className="board-head">
            <div>
              <p className="eyebrow">Regia campi</p>
              <h3>Programma live</h3>
            </div>
            <Status tone="green">Sincronizzato ora</Status>
          </div>
          <div className="fields-grid">
            {fieldNames.map((field, fi) => (
              <div className="field-column" key={field}>
                <header>
                  <span>{field}</span>
                  <small>Future Arena</small>
                </header>
                {slots.map((slot, si) => (
                  <article
                    className={
                      si === 1 ? "match-slot match-slot--live" : "match-slot"
                    }
                    key={slot}
                  >
                    <div>
                      <time>{slot}</time>
                      {si === 1 ? (
                        <Status tone="green">Live</Status>
                      ) : (
                        <Status tone={si === 0 ? "blue" : "gold"}>
                          {si === 0 ? "Fine" : "Attesa"}
                        </Status>
                      )}
                    </div>
                    <b>
                      {
                        ["Roma Nord", "Tuscolana", "Ostia Football"][
                          (fi + si) % 3
                        ]
                      }
                    </b>
                    <span>
                      vs{" "}
                      {
                        ["Sporting EUR", "Castelli", "Prenestino"][
                          (fi + si) % 3
                        ]
                      }
                    </span>
                    <small>
                      201{4 + ((fi + si) % 4)} · Serie{" "}
                      {si % 2 === 0 ? "A" : "B"}
                    </small>
                  </article>
                ))}
              </div>
            ))}
          </div>
        </section>
        <aside className="operations-panel">
          <div className="panel__head">
            <div>
              <p className="eyebrow">Azioni richieste</p>
              <h3>Centro operativo</h3>
            </div>
            <ShieldCheck />
          </div>
          <div className="operation-card operation-card--gold">
            <span>
              <Clock3 /> 09:22
            </span>
            <h4>Referto da verificare</h4>
            <p>Roma Nord 3–1 Sporting EUR</p>
            <button
              onClick={() => notify("Referto aperto in modalità verifica")}
            >
              Apri referto
            </button>
          </div>
          <div className="operation-card">
            <span>
              <Flag /> Campo 2
            </span>
            <h4>Arbitro in ritardo</h4>
            <p>Marco Esposito · gara 09:50</p>
            <button onClick={() => notify("Contatto arbitro avviato")}>
              Contatta
            </button>
          </div>
          <div className="operation-card">
            <span>
              <Bell /> Segnalazione
            </span>
            <h4>Numero maglia errato</h4>
            <p>Academy Tuscolana · Ticket #1042</p>
            <button onClick={() => notify("Ticket assegnato al Direttore")}>
              Gestisci
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}

function LiveControlScreen({tournamentId,notify}:{tournamentId:string;notify:(v:string)=>void}){
  const [data,setData]=useState<TournamentWorkspace|null>(null);
  const [selected,setSelected]=useState<MatchDetail|null>(null);
  const [loading,setLoading]=useState(true);
  async function load(){setLoading(true);try{const response=await fetch(`/api/tournaments/${tournamentId}/workspace`,{cache:"no-store"});const body=await response.json();if(!response.ok)throw new Error();setData(body)}catch{notify("Impossibile caricare la regia del torneo")}finally{setLoading(false)}}
  useEffect(()=>{void load()},[tournamentId]);
  if(loading)return <div className="workspace-loading">Sincronizzazione campi…</div>;
  const rows=data?.matches||[];
  const fields=[...new Set(rows.map(match=>match.field))];
  const reference=rows[0]?new Date(rows[0].startsAt):new Date();
  return <>
    <section className="page-intro"><div><Status tone="green">Dati reali</Status><h2>{reference.toLocaleDateString("it-IT",{weekday:"long",day:"2-digit",month:"long"})}</h2><p>{data?.tournament.name} · {data?.tournament.edition} · {rows.length} gare · {fields.length} campi</p></div><div className="intro-actions"><button className="ghost-button" onClick={()=>notify("Report giornata in preparazione")}><FileCheck2/> Report giornata</button><button className="gold-button" onClick={()=>notify("Calendario sincronizzato con le aree operative")}><Radio/> Sincronizza</button></div></section>
    <section className="metric-grid control-metrics"><article><span>GARE TOTALI</span><strong>{rows.length}</strong><small>Nel torneo selezionato</small></article><article><span>IN CORSO</span><strong className="green-number">{rows.filter(m=>m.status==="live").length}</strong><small>Aggiornamento operativo</small></article><article><span>REFERTI ATTESI</span><strong>{rows.filter(m=>["played","report_submitted","reviewing"].includes(m.status)).length}</strong><small>Da completare o verificare</small></article><article><span>DA RECUPERARE</span><strong>{rows.filter(m=>["postponed","recovery"].includes(m.status)).length}</strong><small>Rinviate o riprogrammate</small></article></section>
    <section className="fields-board"><div className="board-head"><div><p className="eyebrow">Regia campi</p><h3>Programma reale</h3></div><Status tone="green">Sincronizzato</Status></div><div className="fields-grid live-fields-grid">{fields.length?fields.map(field=><div className="field-column" key={field}><header><span>{field.toUpperCase()}</span><small>{rows.find(m=>m.field===field)?.venue}</small></header>{rows.filter(m=>m.field===field).slice(0,12).map(match=>{const date=new Date(match.startsAt);return <button className={match.status==="live"?"match-slot match-slot--live":"match-slot"} key={match.id} onClick={()=>setSelected(match)}><div><time>{date.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})}</time><Status tone={match.status==="live"?"green":match.status==="postponed"?"red":match.status==="official"||match.status==="rectified"?"green":"gold"}>{matchStatusLabel[match.status]||match.status}</Status></div><b>{match.home}</b><span>{match.status==="official"||match.status==="rectified"?`${match.homeScore??0}–${match.awayScore??0}`:"vs"} {match.away}</span><small>{match.tournamentName} · {match.tournamentEdition} · Giornata {match.matchDay} · {match.category} {match.division}</small></button>})}</div>):<div className="team-empty"><CalendarDays/><h3>Nessuna gara programmata</h3><p>Genera il calendario dalla gestione torneo.</p></div>}</div></section>
    {selected && (
      <OperationalMatchDrawer
        matchId={selected.id}
        onClose={() => setSelected(null)}
        onChanged={load}
        notify={notify}
      />
    )}
  </>
}

function ConnectedClubScreen({tournamentId,notify}:{tournamentId:string;notify:(v:string)=>void}){
  const [workspace,setWorkspace]=useState<TournamentWorkspace|null>(null);
  const [teamId,setTeamId]=useState("");
  const [profile,setProfile]=useState<any>(null);
  const [selectedMatch,setSelectedMatch]=useState<MatchDetail|null>(null);
  const [profileOpen,setProfileOpen]=useState(false);
  async function loadWorkspace(){try{const response=await fetch(`/api/tournaments/${tournamentId}/workspace`,{cache:"no-store"});const body=await response.json();if(!response.ok)throw new Error();setWorkspace(body);setTeamId(current=>current&&body.teams.some((team:TeamEntry)=>team.id===current)?current:body.teams[0]?.id||"")}catch{notify("Impossibile caricare l’area società")}}
  useEffect(()=>{void loadWorkspace()},[tournamentId]);
  useEffect(()=>{if(!teamId){setProfile(null);return}void fetch(`/api/teams/${teamId}`,{cache:"no-store"}).then(async response=>{const body=await response.json();if(response.ok)setProfile(body)}).catch(()=>undefined)},[teamId]);
  if(!workspace)return <div className="workspace-loading">Caricamento area società…</div>;
  if(!workspace.teams.length)return <div className="team-empty"><UsersRound/><h3>Nessuna squadra assegnata</h3><p>Il responsabile società vedrà qui soltanto le proprie squadre.</p></div>;
  const team=profile?.team||workspace.teams.find(item=>item.id===teamId);
  const teamMatches=workspace.matches.filter(match=>match.homeTeamId===teamId||match.awayTeamId===teamId);
  const next=teamMatches.find(match=>new Date(match.startsAt)>=new Date()&&!['cancelled'].includes(match.status))||teamMatches[0];
  return <>
    <section className="club-cover" style={team?.coverKey?{backgroundImage:`linear-gradient(105deg,rgba(3,19,31,.94),rgba(7,43,71,.68)),url(${mediaUrl(team.coverKey)})`}:undefined}><div className="club-cover__identity"><span className="club-live-crest" style={{background:team?.primaryColor||"#1778ff"}}>{team?.crestKey?<img src={mediaUrl(team.crestKey)} alt=""/>:team?.shortName}</span><div><Status tone="green">Area collegata</Status><h2>{team?.name||"Società"}</h2><p>{team?.city||""} · {workspace.tournament.name}</p></div></div><div className="club-cover-actions">{workspace.teams.length>1&&<select value={teamId} onChange={e=>setTeamId(e.target.value)}>{workspace.teams.map(item=><option value={item.id} key={item.entryId||item.id}>{item.name} · {item.category} {item.division}</option>)}</select>}<button className="gold-button" onClick={()=>setProfileOpen(true)}><Sparkles/> Gestisci società</button></div></section>
    <section className="metric-grid club-metrics"><article><span>PROSSIMA GARA</span><strong className="metric-time">{next?new Date(next.startsAt).toLocaleDateString("it-IT",{day:"2-digit",month:"short"}):"—"}</strong><small>{next?`${new Date(next.startsAt).toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})} · ${next.field}`:"Calendario non disponibile"}</small></article><article><span>ROSA ATTIVA</span><strong>{profile?.players?.filter((player:Player)=>player.status==="active").length||0}</strong><small>Giocatori registrati</small></article><article><span>GARE</span><strong>{teamMatches.length}</strong><small>{teamMatches.filter(match=>match.status==="official"||match.status==="rectified").length} ufficiali</small></article><article><span>RECUPERI</span><strong>{teamMatches.filter(match=>["postponed","recovery"].includes(match.status)).length}</strong><small>Da riprogrammare o confermare</small></article></section>
    <div className="club-live-layout"><section className="panel"><div className="panel__head"><div><p className="eyebrow">Calendario società</p><h3>Partite e convocazioni</h3></div><CalendarDays/></div><div className="club-match-list">{teamMatches.length?teamMatches.map(match=>{const date=new Date(match.startsAt);return <button key={match.id} onClick={()=>setSelectedMatch(match)}><time>{date.toLocaleDateString("it-IT",{day:"2-digit",month:"short"})}<small>{date.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})}</small></time><span><b>{match.home} – {match.away}</b><small>{match.venue} · {match.field} · Giornata {match.matchDay}</small></span><Status tone={match.status==="official"?"green":match.status==="postponed"?"red":"gold"}>{matchStatusLabel[match.status]||match.status}</Status><ChevronRight/></button>}):<p className="muted-copy">Nessuna partita programmata.</p>}</div></section><section className="panel roster-panel"><div className="panel__head"><div><p className="eyebrow">Rosa reale</p><h3>Giocatori</h3></div><button onClick={()=>setProfileOpen(true)}><Plus/> Gestisci</button></div>{profile?.players?.length?profile.players.map((player:Player)=><div className="player-row" key={player.id}><span className="player-avatar">{player.photoKey?<img src={mediaUrl(player.photoKey)} alt=""/>:`${player.firstName[0]}${player.lastName[0]}`}</span><div><b>{player.firstName} {player.lastName}</b><small>#{player.shirtNumber||"—"} · {player.role}</small></div><Status tone={player.status==="active"?"green":"gold"}>{player.status}</Status></div>):<p className="muted-copy">Rosa non ancora inserita.</p>}</section></div>
    {profileOpen&&<TeamProfileDrawer teamId={teamId} onClose={()=>{setProfileOpen(false);void loadWorkspace()}} notify={notify}/>}
    {selectedMatch&&<OperationalMatchDrawer matchId={selectedMatch.id} onClose={()=>setSelectedMatch(null)} onChanged={loadWorkspace} notify={notify}/>}
  </>
}

function ConnectedRefereeScreen({tournamentId,notify}:{tournamentId:string;notify:(v:string)=>void}){
  const [data,setData]=useState<TournamentWorkspace|null>(null);
  const [selected,setSelected]=useState<MatchDetail|null>(null);
  async function load(){try{const response=await fetch(`/api/tournaments/${tournamentId}/workspace`,{cache:"no-store"});const body=await response.json();if(!response.ok)throw new Error();setData(body)}catch{notify("Impossibile caricare le gare assegnate")}}
  useEffect(()=>{void load()},[tournamentId]);
  if(!data)return <div className="workspace-loading">Caricamento gare arbitro…</div>;
  return <div className="referee-workspace"><section className="referee-workspace-head"><div><Status tone="blue">{data.viewerRole==="REFEREE"?"Le mie gare":"Vista amministratore"}</Status><h2>Gare assegnate</h2><p>{data.viewerName} · {data.tournament.name}</p></div><Flag/></section><div className="referee-match-grid">{data.matches.length?data.matches.map(match=>{const date=new Date(match.startsAt);return <button key={match.id} onClick={()=>setSelected(match)}><header><time>{date.toLocaleDateString("it-IT",{weekday:"short",day:"2-digit",month:"short"})} · {date.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})}</time><Status tone={match.status==="report_submitted"?"blue":match.status==="official"?"green":"gold"}>{matchStatusLabel[match.status]||match.status}</Status></header><span>{match.category} · {match.division} · Giornata {match.matchDay}</span><div><b>{match.home}</b><em>VS</em><b>{match.away}</b></div><footer><span><MapPin/> {match.venue} · {match.field}</span><strong>{match.refereeName||"Arbitro da assegnare"}</strong></footer></button>}):<div className="team-empty"><Flag/><h3>Nessuna gara assegnata</h3><p>Quando il Direttore assegna una partita, comparirà automaticamente qui.</p></div>}</div>{selected&&<OperationalMatchDrawer matchId={selected.id} onClose={()=>setSelected(null)} onChanged={load} notify={notify}/>}</div>
}

function ClubScreen({ notify }: { notify: (v: string) => void }) {
  const players = [
    "Luca Ferri",
    "Matteo Rinaldi",
    "Andrea Conti",
    "Diego Moretti",
    "Nicolò Bassi",
  ];
  return (
    <>
      <section className="club-cover">
        <div className="club-cover__identity">
          <ClubBadge initials="RN" color="red" />
          <div>
            <Status tone="green">Profilo pubblicato</Status>
            <h2>ROMA NORD</h2>
            <p>Responsabile società · Categoria 2014 Serie A</p>
          </div>
        </div>
        <button
          className="gold-button"
          onClick={() => notify("Studio personalizzazione aperto")}
        >
          <Sparkles size={18} /> Personalizza profilo
        </button>
      </section>
      <section className="metric-grid club-metrics">
        <article>
          <span>PROSSIMA GARA</span>
          <strong className="metric-time">SAB 08:30</strong>
          <small>vs Sporting EUR · Campo 1</small>
        </article>
        <article>
          <span>ROSA ATTIVA</span>
          <strong>18</strong>
          <small>
            <b>16</b> idonei
          </small>
        </article>
        <article>
          <span>DOCUMENTI</span>
          <strong>94%</strong>
          <small>2 scadenze da gestire</small>
        </article>
        <article>
          <span>SALDO</span>
          <strong>€ 224</strong>
          <small>Scadenza 15 ottobre</small>
        </article>
      </section>
      <div className="club-layout">
        <section className="panel roster-panel">
          <div className="panel__head">
            <div>
              <p className="eyebrow">Squadra 2014</p>
              <h3>Rosa e idoneità</h3>
            </div>
            <button
              onClick={() =>
                notify("Nuovo giocatore: funzione in preparazione")
              }
            >
              <Plus size={16} /> Giocatore
            </button>
          </div>
          {players.map((p, i) => (
            <div className="player-row" key={p}>
              <span className="player-avatar">
                {p
                  .split(" ")
                  .map((v) => v[0])
                  .join("")}
              </span>
              <div>
                <b>{p}</b>
                <small>
                  #{7 + i} ·{" "}
                  {i === 0
                    ? "Attaccante"
                    : i < 3
                      ? "Centrocampista"
                      : "Difensore"}
                </small>
              </div>
              <Status tone={i === 3 ? "gold" : "green"}>
                {i === 3 ? "In scadenza" : "Idoneo"}
              </Status>
              <button
                aria-label={`Apri ${p}`}
                onClick={() => notify(`Scheda di ${p} aperta`)}
              >
                →
              </button>
            </div>
          ))}
        </section>
        <aside className="panel compliance-panel">
          <div className="panel__head">
            <div>
              <p className="eyebrow">Da completare</p>
              <h3>Attività società</h3>
            </div>
            <FileCheck2 />
          </div>
          <div className="task">
            <span className="task-icon task-icon--gold">
              <FileCheck2 />
            </span>
            <div>
              <b>2 certificati in scadenza</b>
              <small>Entro i prossimi 15 giorni</small>
            </div>
          </div>
          <div className="task">
            <span className="task-icon task-icon--blue">
              <UserRound />
            </span>
            <div>
              <b>Convocazione da inviare</b>
              <small>Roma Nord – Sporting EUR</small>
            </div>
          </div>
          <div className="task">
            <span className="task-icon task-icon--red">
              <CircleDollarSign />
            </span>
            <div>
              <b>Estratto conto aperto</b>
              <small>2 gare · €224,00</small>
            </div>
          </div>
          <button
            className="wide-button"
            onClick={() => notify("Centro attività aperto")}
          >
            Apri centro attività
          </button>
        </aside>
      </div>
    </>
  );
}

function RefereeScreen({ notify }: { notify: (v: string) => void }) {
  const [home, setHome] = useState(2);
  const [away, setAway] = useState(1);
  return (
    <div className="referee-stage">
      <section className="referee-copy">
        <Status tone="blue">Vista mobile</Status>
        <h2>
          Il referto,
          <br />
          <em>senza attriti.</em>
        </h2>
        <p>
          L'arbitro registra la gara anche con connessione instabile. Il
          Direttore resta l'unico a ufficializzare il risultato.
        </p>
        <div className="feature-line">
          <ShieldCheck />
          <span>
            <b>Bozza protetta</b>
            <small>Salvataggio continuo</small>
          </span>
        </div>
        <div className="feature-line">
          <Radio />
          <span>
            <b>Sincronizzazione</b>
            <small>Eventi senza duplicazioni</small>
          </span>
        </div>
        <div className="feature-line">
          <FileCheck2 />
          <span>
            <b>Referto versionato</b>
            <small>Invio e blocco automatico</small>
          </span>
        </div>
      </section>
      <section className="phone">
        <header>
          <Mark small />
          <div>
            <b>Gara assegnata</b>
            <small>Sabato 10 ottobre · 08:30</small>
          </div>
          <Status tone="green">Online</Status>
        </header>
        <div className="phone__match">
          <span>2014 · SERIE A</span>
          <div className="phone__teams">
            <div>
              <ClubBadge initials="RN" color="red" />
              <b>Roma Nord</b>
            </div>
            <strong>
              {home}
              <i>:</i>
              {away}
            </strong>
            <div>
              <ClubBadge initials="SE" color="blue" />
              <b>Sporting EUR</b>
            </div>
          </div>
          <small>
            <Clock3 size={14} /> 24:18 · Secondo tempo
          </small>
        </div>
        <div className="score-actions">
          <button onClick={() => setHome(home + 1)}>+ Gol casa</button>
          <button onClick={() => setAway(away + 1)}>+ Gol ospite</button>
        </div>
        <div className="event-list">
          <div>
            <span className="event-minute">18&apos;</span>
            <span className="event-ball">●</span>
            <p>
              <b>Luca Ferri</b>
              <small>Roma Nord · Gol</small>
            </p>
          </div>
          <div>
            <span className="event-minute">11&apos;</span>
            <span className="event-card" />
            <p>
              <b>Andrea Conti</b>
              <small>Roma Nord · Ammonizione</small>
            </p>
          </div>
          <div>
            <span className="event-minute">07&apos;</span>
            <span className="event-ball">●</span>
            <p>
              <b>Marco Belli</b>
              <small>Sporting EUR · Gol</small>
            </p>
          </div>
        </div>
        <button
          className="submit-report"
          onClick={() => notify("Referto salvato come bozza")}
        >
          Salva e continua
        </button>
      </section>
    </div>
  );
}

function CreateScreen({
  onBack,
  notify,
  onCreated,
}: {
  onBack: () => void;
  notify: (v: string) => void;
  onCreated: (item: Tournament) => void;
}) {
  const [mode, setMode] = useState("zero");
  const [name, setName] = useState("");
  const [edition, setEdition] = useState("2027");
  const [settings,setSettings]=useState<CompetitionSetting[]>([{name:"Campionato",kind:"league",category:"",division:"",maxTeams:10,format:"Girone unico · sola andata",finals:"Nessuna fase finale",finalsConfig:{mode:"none",qualifiers:0,semifinalLegs:1,finalLegs:1,thirdPlace:false},enabled:true}]);
  const [fields,setFields]=useState<TournamentField[]>([{venueName:"",address:"",fieldName:"",fieldNumber:"1",active:true}]);
  const [scheduleConfig,setScheduleConfig]=useState<ScheduleConfig>({startDate:"2027-10-01",endDate:"2028-05-31",startTime:"08:30",endTime:"13:30",matchMinutes:30,bufferMinutes:10,matchFeeCents:800,activeDays:[6,0]});
  const [saving, setSaving] = useState(false);
  async function create() {
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/tournaments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, edition, settings, fields, scheduleConfig }),
      });
      const body = await response.json();
      if (!response.ok) {
        notify(body.error ?? "Impossibile creare il torneo");
        return;
      }
      onCreated(body.tournament);
    } catch {
      notify("Connessione non disponibile: riprova");
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="create-view">
      <button className="back-button" onClick={onBack}>
        ← Torna ai tornei
      </button>
      <div className="create-head">
        <span className="number-chip">01</span>
        <div>
          <p className="eyebrow">Nuova competizione</p>
          <h2>Da dove vuoi partire?</h2>
          <p>
            La struttura può essere modificata in ogni momento prima della
            pubblicazione.
          </p>
        </div>
      </div>
      <div className="creation-options">
        <button
          className={mode === "zero" ? "chosen" : ""}
          onClick={() => setMode("zero")}
        >
          <span>
            <Plus />
          </span>
          <b>Parti da zero</b>
          <small>Configura ogni regola del torneo</small>
        </button>
        <button
          className={mode === "template" ? "chosen" : ""}
          onClick={() => setMode("template")}
        >
          <span>
            <Sparkles />
          </span>
          <b>Usa un modello</b>
          <small>Parti da una struttura collaudata</small>
        </button>
        <button
          className={mode === "duplicate" ? "chosen" : ""}
          onClick={() => setMode("duplicate")}
        >
          <span>
            <Archive />
          </span>
          <b>Duplica esistente</b>
          <small>Copia regole, categorie e campi</small>
        </button>
      </div>
      <div className="setup-form">
        <label>
          <span>Nome del torneo</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Es. Summer Stars Cup"
          />
        </label>
        <label>
          <span>Edizione</span>
          <input value={edition} onChange={(e) => setEdition(e.target.value)} />
        </label>
        <label><span>Inizio</span><input type="date" value={scheduleConfig.startDate} onChange={e=>setScheduleConfig({...scheduleConfig,startDate:e.target.value})}/></label>
        <label><span>Fine</span><input type="date" value={scheduleConfig.endDate} onChange={e=>setScheduleConfig({...scheduleConfig,endDate:e.target.value})}/></label>
        <label>
          <span>Visibilità iniziale</span>
          <select defaultValue="draft">
            <option value="draft">Bozza privata</option>
            <option value="public">Pubblico</option>
          </select>
        </label>
      </div>
      <div className="creation-config-grid">
        <section><header><div><p className="eyebrow">Categorie libere</p><h3>Età e competizioni</h3></div><button className="ghost-button" onClick={()=>setSettings([...settings,{name:"Campionato",kind:"league",category:"",division:"",maxTeams:2,format:"Girone unico · sola andata",finals:"Nessuna fase finale",finalsConfig:{mode:"none",qualifiers:0,semifinalLegs:1,finalLegs:1,thirdPlace:false},enabled:true}])}><Plus/> Aggiungi</button></header>{settings.map((row,index)=><div className="creation-config-row" key={index}><input value={row.category} onChange={e=>setSettings(values=>values.map((v,i)=>i===index?{...v,category:e.target.value}:v))} placeholder="Età/categoria"/><input value={row.division} onChange={e=>setSettings(values=>values.map((v,i)=>i===index?{...v,division:e.target.value}:v))} placeholder="Serie/girone"/><input type="number" min="2" max="200" value={row.maxTeams} onChange={e=>setSettings(values=>values.map((v,i)=>i===index?{...v,maxTeams:Number(e.target.value)}:v))}/><button className="row-trash" onClick={()=>setSettings(settings.filter((_,i)=>i!==index))}><Trash2/></button></div>)}</section>
        <section><header><div><p className="eyebrow">Campi liberi</p><h3>Anagrafica iniziale</h3></div><button className="ghost-button" onClick={()=>setFields([...fields,{venueName:"",address:"",fieldName:"",fieldNumber:"",active:true}])}><Plus/> Aggiungi</button></header>{fields.map((row,index)=><div className="creation-field-row" key={index}><input value={row.venueName} onChange={e=>setFields(values=>values.map((v,i)=>i===index?{...v,venueName:e.target.value}:v))} placeholder="Nome sede"/><input value={row.fieldName} onChange={e=>setFields(values=>values.map((v,i)=>i===index?{...v,fieldName:e.target.value}:v))} placeholder="Nome campo"/><input value={row.fieldNumber||""} onChange={e=>setFields(values=>values.map((v,i)=>i===index?{...v,fieldNumber:e.target.value}:v))} placeholder="N./codice"/><button className="row-trash" onClick={()=>setFields(fields.filter((_,i)=>i!==index))}><Trash2/></button></div>)}</section>
      </div>
      <div className="creation-schedule"><label><span>Dalle</span><input type="time" value={scheduleConfig.startTime} onChange={e=>setScheduleConfig({...scheduleConfig,startTime:e.target.value})}/></label><label><span>Alle</span><input type="time" value={scheduleConfig.endTime} onChange={e=>setScheduleConfig({...scheduleConfig,endTime:e.target.value})}/></label><label><span>Minuti partita</span><input type="number" min="5" value={scheduleConfig.matchMinutes} onChange={e=>setScheduleConfig({...scheduleConfig,matchMinutes:Number(e.target.value)})}/></label><label><span>Intervallo</span><input type="number" min="0" value={scheduleConfig.bufferMinutes} onChange={e=>setScheduleConfig({...scheduleConfig,bufferMinutes:Number(e.target.value)})}/></label><label><span>Quota per convocato (€)</span><input type="number" min="0" step="0.50" value={(scheduleConfig.matchFeeCents/100).toFixed(2)} onChange={e=>setScheduleConfig({...scheduleConfig,matchFeeCents:Math.max(0,Math.round(Number(e.target.value)*100))})}/></label></div>
      <div className="form-footer">
        <span>
          <ShieldCheck /> Il torneo sarà salvato e separato dagli altri.
        </span>
        <button className="gold-button" onClick={create} disabled={saving||settings.length===0||fields.length===0||settings.some(row=>!row.category.trim()||!row.division.trim())||fields.some(row=>!row.venueName.trim()||!row.fieldName.trim())}>
          {saving ? "Salvataggio…" : "Crea bozza"} <span>→</span>
        </button>
      </div>
    </section>
  );
}

export default function Home() {
  return <AppShell />;
}
