window.RQFIT_PRESET_EXERCISES=[
 {id:'db-incline-press',name:'Dumbbell Incline Bench Press',type:'strength',muscles:['chest','shoulders','triceps'],equipment:['dumbbells','incline bench'],defaultWeight:10,defaultSets:5,defaultReps:8,defaultRestSec:120,cues:['Bench at a modest incline.','Press smoothly; keep wrists stacked.'],sourceUrl:'https://exrx.net/WeightExercises/PectoralClavicular/DBInclineBenchPress'},
 {id:'db-shoulder-press',name:'Dumbbell Shoulder Press',type:'strength',muscles:['shoulders','triceps'],equipment:['dumbbells','bench'],defaultWeight:10,defaultSets:5,defaultReps:8,defaultRestSec:95,cues:['Brace ribs down.','Press overhead without shrugging hard.'],sourceUrl:'https://exrx.net/WeightExercises/DeltoidAnterior/DBShoulderPress'},
 {id:'db-lateral-raise',name:'Dumbbell Lateral Raise',type:'strength',muscles:['shoulders'],equipment:['dumbbells'],defaultWeight:10,defaultSets:3,defaultReps:10,defaultRestSec:81,cues:['Soft elbows.','Raise only to comfortable shoulder height.'],sourceUrl:'https://exrx.net/WeightExercises/DeltoidLateral/DBLateralRaise'},
 {id:'stationary-bike',name:'Stationary Bike Interval',type:'cardio',muscles:['cardio'],equipment:['stationary bike'],defaultDurationSec:300,defaultRestSec:0,cues:['Start easy, then alternate hard/easy efforts.']},
 {id:'db-squat',name:'Dumbbell Squat',type:'strength',muscles:['quads','glutes','core'],equipment:['dumbbells'],defaultWeight:10,defaultSets:5,defaultReps:6,defaultRestSec:135,cues:['Brace before descent.','Keep feet planted.'],sourceUrl:'https://exrx.net/WeightExercises/Quadriceps/DBSquat'},
 {id:'db-lunge',name:'Dumbbell Lunge',type:'strength',muscles:['quads','glutes'],equipment:['dumbbells'],defaultWeight:10,defaultSets:3,defaultReps:10,defaultRestSec:75,cues:['Short controlled step.','Push through the front foot.'],sourceUrl:'https://exrx.net/WeightExercises/Quadriceps/DBLunge'},
 {id:'db-side-bend',name:'Dumbbell Side Bend',type:'strength',muscles:['obliques'],equipment:['dumbbells'],defaultWeight:10,defaultSets:3,defaultReps:10,defaultRestSec:75,cues:['Move slowly.','Do not twist.'],sourceUrl:'https://exrx.net/WeightExercises/Obliques/DBSideBend'},
 {id:'bb-bent-row',name:'Barbell Bent-Over Row',type:'strength',muscles:['back','biceps'],equipment:['barbell'],defaultWeight:45,defaultSets:3,defaultReps:8,defaultRestSec:120,cues:['Hinge, brace, neutral back.','Pull elbows toward hips.'],sourceUrl:'https://exrx.net/WeightExercises/BackGeneral/BBBentOverRow'},
 {id:'bb-back-squat',name:'Barbell Back Squat',type:'strength',muscles:['quads','glutes'],equipment:['barbell','squat rack'],defaultWeight:45,defaultSets:3,defaultReps:5,defaultRestSec:150,cues:['Set safeties.','Brace and control depth.']},
 {id:'bench-press',name:'Barbell Bench Press',type:'strength',muscles:['chest','triceps'],equipment:['barbell','bench'],defaultWeight:45,defaultSets:3,defaultReps:5,defaultRestSec:150,cues:['Shoulder blades back.','Use safeties or spotter.']},
 {id:'band-row',name:'Resistance Band Row',type:'strength',muscles:['back'],equipment:['resistance bands'],defaultWeight:0,defaultSets:3,defaultReps:12,defaultRestSec:60,cues:['Anchor securely.','Pause at ribs.']},
 {id:'pullup-assisted',name:'Assisted Pull-up / Dead Hang',type:'strength',muscles:['back','grip'],equipment:['pullup bar','resistance bands'],defaultSets:3,defaultReps:5,defaultRestSec:90,cues:['Start with hangs or band assistance.','Stop before shoulder irritation.']},
 {id:'treadmill-walk',name:'Treadmill Walk',type:'cardio',muscles:['cardio'],equipment:['treadmill'],defaultDurationSec:600,defaultRestSec:0,cues:['Comfortable pace.','Light incline optional.']},
 {id:'pushup',name:'Incline Push-up',type:'strength',muscles:['chest','triceps','core'],equipment:['bodyweight','bench'],defaultSets:3,defaultReps:8,defaultRestSec:75,cues:['Use bench height that feels controlled.','Keep body rigid.']}
];
window.RQFIT_STARTER_ROUTINE={rotationIndex:0,days:[
 {id:'day-upper',name:'Day 1 — Upper Body',notes:'Starter upper body session.',exercises:[
  {exerciseId:'db-incline-press',weight:10,sets:5,reps:8,restSec:120},
  {exerciseId:'db-shoulder-press',weight:10,sets:5,reps:8,restSec:95},
  {exerciseId:'db-lateral-raise',weight:10,sets:3,reps:10,restSec:81},
  {exerciseId:'stationary-bike',durationSec:300}
 ]},
 {id:'day-lower',name:'Day 3 — Lower Body',notes:'Starter lower body session.',exercises:[
  {exerciseId:'db-squat',weight:10,sets:5,reps:6,restSec:135},
  {exerciseId:'db-lunge',weight:10,sets:3,reps:10,restSec:75},
  {exerciseId:'db-side-bend',weight:10,sets:3,reps:10,restSec:75},
  {exerciseId:'stationary-bike',durationSec:300}
 ]}
]};
