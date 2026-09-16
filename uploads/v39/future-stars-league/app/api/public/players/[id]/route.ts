import { rawDb } from "../../../../../db/fsl";

export const dynamic = "force-dynamic";

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params,db=rawDb();
    const player=await db.prepare("SELECT p.id,p.public_name AS publicName,p.birth_year AS birthYear,p.shirt_number AS shirtNumber,p.role,p.bio,p.preferred_foot AS preferredFoot,p.photo_key AS photoKey,t.name AS teamName,t.short_name AS teamShort,t.primary_color AS primaryColor,t.secondary_color AS secondaryColor,t.crest_key AS crestKey FROM players p JOIN teams t ON t.id=p.team_id WHERE p.id=? AND p.profile_visibility='public' AND p.media_consent=1").bind(id).first();
    if(!player)return Response.json({error:"Profilo non pubblico"},{status:404});
    const [stats,milestones,awards,fantasy]=await Promise.all([
      db.prepare("SELECT s.tournament_id AS tournamentId,t.name AS tournamentName,t.edition,s.appearances,s.goals,s.assists,s.clean_sheets AS cleanSheets,s.mvp_awards AS mvpAwards,s.minutes_played AS minutesPlayed FROM player_tournament_stats s JOIN tournaments t ON t.id=s.tournament_id WHERE s.player_id=? ORDER BY t.created_at DESC").bind(id).all(),
      db.prepare("SELECT type,title,description,happened_at AS happenedAt FROM player_milestones WHERE player_id=? ORDER BY happened_at DESC LIMIT 12").bind(id).all(),
      db.prepare("SELECT id,type,title,note,awarded_at AS awardedAt FROM awards WHERE player_id=? AND status='published' ORDER BY awarded_at DESC LIMIT 12").bind(id).all(),
      db.prepare("SELECT m.tournament_id AS tournamentId,t.name AS tournamentName,t.edition,COUNT(*) AS ratedMatches,ROUND(AVG(mr.final_rating_tenths)/10.0,2) AS averageRating,MAX(mr.final_rating_tenths)/10.0 AS bestRating FROM match_player_ratings mr JOIN matches m ON m.id=mr.match_id JOIN tournaments t ON t.id=m.tournament_id WHERE mr.player_id=? AND m.status IN ('official','rectified') GROUP BY m.tournament_id,t.name,t.edition ORDER BY t.created_at DESC").bind(id).all(),
    ]);
    return Response.json({player,stats:stats.results,milestones:milestones.results,awards:awards.results.map((award:any)=>({...award,automatic:String(award.type).startsWith("badge_")})),fantasy:fantasy.results,futureStarsId:`FSL-${player.birthYear}-${id.replaceAll("-","").slice(0,6).toUpperCase()}`});
  }catch{return Response.json({error:"Profilo non disponibile"},{status:500})}
}
