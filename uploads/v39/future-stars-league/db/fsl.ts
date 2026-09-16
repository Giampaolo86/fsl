import { env } from "cloudflare:workers";

export type AppUser = { userId: string; email: string; displayName: string };
export function rawDb() {
  if (!env.DB) throw new Error("DB_UNAVAILABLE");
  return env.DB;
}

export async function ensureWorkspace(user: AppUser) {
  const db = rawDb();
  const now = new Date().toISOString();
  await db
    .prepare(
      "INSERT INTO users (id,email,full_name,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,full_name=excluded.full_name,updated_at=excluded.updated_at",
    )
    .bind(user.userId, user.email, user.displayName, now, now)
    .run();
  let membership = await db
    .prepare(
      "SELECT organization_id AS organizationId,role FROM memberships WHERE user_id=? AND status='active' ORDER BY CASE role WHEN 'SUPER_ADMIN' THEN 1 ELSE 2 END LIMIT 1",
    )
    .bind(user.userId)
    .first<{ organizationId: string; role: string }>();
  if (!membership) {
    const pending = await db
      .prepare(
        "SELECT id,organization_id AS organizationId,tournament_id AS tournamentId,team_id AS teamId,role FROM invitations WHERE lower(email)=lower(?) AND status='pending' ORDER BY created_at",
      )
      .bind(user.email)
      .all<{
        id: string;
        organizationId: string;
        tournamentId: string | null;
        teamId: string | null;
        role: string;
      }>();
    for (const invite of pending.results) {
      await db.batch([
        db
          .prepare(
            "INSERT INTO memberships (id,user_id,organization_id,tournament_id,role,status,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
          )
          .bind(
            `membership_${invite.id}_${user.userId}`,
            user.userId,
            invite.organizationId,
            invite.tournamentId,
            invite.role,
            "active",
            now,
          ),
        db
          .prepare(
            "UPDATE invitations SET status='accepted',accepted_at=? WHERE id=?",
          )
          .bind(now, invite.id),
      ]);
      if (invite.role === "CLUB_MANAGER" && invite.teamId)
        await db.batch([
          db.prepare("UPDATE teams SET club_manager_user_id=? WHERE id=? OR club_id=(SELECT club_id FROM teams WHERE id=?)").bind(user.userId, invite.teamId, invite.teamId),
          db.prepare("UPDATE clubs SET club_manager_user_id=? WHERE id=(SELECT club_id FROM teams WHERE id=?)").bind(user.userId, invite.teamId),
        ]);
    }
    membership = pending.results[0]
      ? {
          organizationId: pending.results[0].organizationId,
          role: pending.results[0].role,
        }
      : undefined;
  }
  if (membership)
    return {
      organizationId: membership.organizationId,
      role: membership.role,
    };
  const organizationId = `org_${user.userId}`;
  await db.batch([
    db
      .prepare(
        "INSERT INTO organizations (id,name,slug,owner_user_id,created_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
      )
      .bind(
        organizationId,
        "Future Stars League",
        `future-stars-${user.userId}`,
        user.userId,
        now,
      ),
    db
      .prepare(
        "INSERT INTO memberships (id,user_id,organization_id,tournament_id,role,status,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
      )
      .bind(
        `membership_${user.userId}`,
        user.userId,
        organizationId,
        null,
        "SUPER_ADMIN",
        "active",
        now,
      ),
  ]);
  const count = await db
    .prepare(
      "SELECT COUNT(*) AS total FROM tournaments WHERE organization_id=?",
    )
    .bind(organizationId)
    .first<{ total: number }>();
  if (!count?.total) {
    const seeds = [
      [
        "t_fsl",
        "Future Stars League",
        "2026/27",
        "active",
        144,
        3,
        34,
        "#f4ae2b",
      ],
      [
        "t_amici",
        "Torneo degli Amici",
        "Autunno 2026",
        "active",
        10,
        2,
        61,
        "#36c98f",
      ],
      [
        "t_roma",
        "Roma Youth Cup",
        "Primavera 2027",
        "draft",
        32,
        4,
        12,
        "#1778ff",
      ],
      [
        "t_archive",
        "Future Stars League",
        "2025/26",
        "archived",
        136,
        3,
        100,
        "#7892a7",
      ],
    ] as const;
    for (const item of seeds) {
      await db.batch([
        db
          .prepare(
            "INSERT INTO tournaments (id,organization_id,name,edition,status,team_count,field_count,progress,accent,created_by,created_at,updated_at,archived_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            item[0],
            organizationId,
            item[1],
            item[2],
            item[3],
            item[4],
            item[5],
            item[6],
            item[7],
            user.userId,
            now,
            now,
            item[3] === "archived" ? now : null,
          ),
        db
          .prepare(
            "INSERT INTO memberships (id,user_id,organization_id,tournament_id,role,status,created_at) VALUES (?,?,?,?,?,?,?)",
          )
          .bind(
            `membership_${user.userId}_${item[0]}`,
            user.userId,
            organizationId,
            item[0],
            "SUPER_ADMIN",
            "active",
            now,
          ),
      ]);
    }
  }
  const teamCount = await db
    .prepare("SELECT COUNT(*) AS total FROM teams WHERE organization_id=?")
    .bind(organizationId)
    .first<{ total: number }>();
  if (!teamCount?.total) {
    const seedTeams = [
      ["rn", "Roma Nord", "RN", "#e54835"],
      ["se", "Sporting EUR", "SE", "#1778ff"],
      ["at", "Academy Tuscolana", "AT", "#f4ae2b"],
      ["ca", "Castelli Academy", "CA", "#66b847"],
      ["ap", "Atletico Prenestino", "AP", "#a557ff"],
      ["of", "Ostia Football", "OF", "#20a9c9"],
      ["ttt", "Tor Tre Teste", "TTT", "#e54835"],
      ["la", "Lazio Academy", "LA", "#67a7ff"],
    ] as const;
    for (const item of seedTeams)
      await db
        .prepare(
          "INSERT INTO teams (id,organization_id,name,short_name,city,primary_color,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
        )
        .bind(
          `${organizationId}_team_${item[0]}`,
          organizationId,
          item[1],
          item[2],
          "Roma",
          item[3],
          now,
          now,
        )
        .run();
  }
  const linked = await db
    .prepare(
      "SELECT COUNT(*) AS total FROM tournament_teams WHERE tournament_id='t_fsl'",
    )
    .first<{ total: number }>();
  if (!linked?.total) {
    const ids = ["rn", "se", "at", "ca", "ap", "of"];
    for (let index = 0; index < ids.length; index++)
      await db
        .prepare(
          "INSERT INTO tournament_teams (id,tournament_id,team_id,category,division,status,created_at) VALUES (?,?,?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          "t_fsl",
          `${organizationId}_team_${ids[index]}`,
          index < 4 ? "2014" : "2015",
          index < 3 ? "Serie A" : "Serie B",
          "confirmed",
          now,
        )
        .run();
  }
  const matchCount = await db
    .prepare(
      "SELECT COUNT(*) AS total FROM matches WHERE tournament_id='t_fsl'",
    )
    .first<{ total: number }>();
  if (!matchCount?.total) {
    const callups = {
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
    };
    await db
      .prepare(
        "INSERT INTO matches (id,tournament_id,home_team_id,away_team_id,category,division,match_day,starts_at,venue,field,referee_name,status,callups_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        "match_fsl_1",
        "t_fsl",
        `${organizationId}_team_rn`,
        `${organizationId}_team_se`,
        "2014",
        "Serie A",
        9,
        "2026-10-10T08:30:00+02:00",
        "Future Arena",
        "Campo 1",
        "Marco Esposito",
        "scheduled",
        JSON.stringify(callups),
        now,
        now,
      )
      .run();
  }
  const settingsCount = await db
    .prepare(
      "SELECT COUNT(*) AS total FROM competition_settings WHERE tournament_id='t_fsl'",
    )
    .first<{ total: number }>();
  if (!settingsCount?.total) {
    for (const category of ["2014", "2015", "2016", "2017"])
      for (const division of ["Serie A", "Serie B"])
        await db
          .prepare(
            "INSERT INTO competition_settings (id,tournament_id,category,division,max_teams,format,finals,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            crypto.randomUUID(),
            "t_fsl",
            category,
            division,
            18,
            "Girone unico · sola andata",
            "Playoff e playout",
            1,
            now,
            now,
          )
          .run();
  }
  const playerCount = await db
    .prepare("SELECT COUNT(*) AS total FROM players WHERE team_id=?")
    .bind(`${organizationId}_team_rn`)
    .first<{ total: number }>();
  if (!playerCount?.total) {
    const roster = [
      ["Luca", "Ferri", 9, "Attaccante"],
      ["Matteo", "Rinaldi", 10, "Centrocampista"],
      ["Andrea", "Conti", 6, "Centrocampista"],
      ["Diego", "Moretti", 4, "Difensore"],
      ["Nicolò", "Bassi", 7, "Esterno"],
      ["Simone", "Greco", 1, "Portiere"],
    ] as const;
    for (const player of roster)
      await db
        .prepare(
          "INSERT INTO players (id,team_id,first_name,last_name,birth_year,shirt_number,role,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          `${organizationId}_team_rn`,
          player[0],
          player[1],
          2014,
          player[2],
          player[3],
          "active",
          now,
          now,
        )
        .run();
  }
  return { organizationId, role: "SUPER_ADMIN" as const };
}

export async function requireRole(
  userId: string,
  organizationId: string,
  roles: string[],
) {
  const row = await rawDb()
    .prepare(
      "SELECT role FROM memberships WHERE user_id=? AND organization_id=? AND status='active' AND tournament_id IS NULL LIMIT 1",
    )
    .bind(userId, organizationId)
    .first<{ role: string }>();
  if (!row || !roles.includes(row.role)) throw new Error("FORBIDDEN");
  return row.role;
}
export async function appendAudit(input: {
  tournamentId?: string | null;
  userId: string;
  role: string;
  action: string;
  entityType: string;
  entityId: string;
  payload?: unknown;
}) {
  await rawDb()
    .prepare(
      "INSERT INTO audit_events (id,tournament_id,actor_user_id,actor_role,action,entity_type,entity_id,payload,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      crypto.randomUUID(),
      input.tournamentId ?? null,
      input.userId,
      input.role,
      input.action,
      input.entityType,
      input.entityId,
      input.payload ? JSON.stringify(input.payload) : null,
      new Date().toISOString(),
    )
    .run();
}
