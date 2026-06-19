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


// Optional import pack built from the uploaded free-weight exercise PDF.
// Exercise demo links are generated as ExRx search links; no ExRx media/database content is copied.
window.RQFIT_FREE_WEIGHT_EXERCISES=[
 {
  "id": "fw-flat-dumbbell-chest-press",
  "name": "Flat Dumbbell Chest Press",
  "type": "strength",
  "muscles": [
   "chest"
  ],
  "equipment": [
   "dumbbells"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Flat%20Dumbbell%20Chest%20Press",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-incline-dumbbell-bench-press",
  "name": "Incline Dumbbell Bench Press",
  "type": "strength",
  "muscles": [
   "chest"
  ],
  "equipment": [
   "dumbbells",
   "bench"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Incline%20Dumbbell%20Bench%20Press",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-flat-dumbbell-fly",
  "name": "Flat Dumbbell Fly",
  "type": "strength",
  "muscles": [
   "chest"
  ],
  "equipment": [
   "dumbbells"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Flat%20Dumbbell%20Fly",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-incline-dumbbell-fly",
  "name": "Incline Dumbbell Fly",
  "type": "strength",
  "muscles": [
   "chest"
  ],
  "equipment": [
   "dumbbells",
   "bench"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Incline%20Dumbbell%20Fly",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-dumbbell-pullover",
  "name": "Dumbbell Pullover",
  "type": "strength",
  "muscles": [
   "chest"
  ],
  "equipment": [
   "dumbbells"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Dumbbell%20Pullover",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-decline-dumbbell-bench-press",
  "name": "Decline Dumbbell Bench Press",
  "type": "strength",
  "muscles": [
   "chest"
  ],
  "equipment": [
   "dumbbells",
   "bench"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Decline%20Dumbbell%20Bench%20Press",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-dumbbell-squeeze-press",
  "name": "Dumbbell Squeeze Press",
  "type": "strength",
  "muscles": [
   "chest"
  ],
  "equipment": [
   "dumbbells"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Dumbbell%20Squeeze%20Press",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-dumbbell-upward-fly",
  "name": "Dumbbell Upward Fly",
  "type": "strength",
  "muscles": [
   "chest"
  ],
  "equipment": [
   "dumbbells"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Dumbbell%20Upward%20Fly",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-landmine-press",
  "name": "Landmine Press",
  "type": "strength",
  "muscles": [
   "chest"
  ],
  "equipment": [
   "landmine"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Landmine%20Press",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-barbell-rolling-chest-fly",
  "name": "Barbell Rolling Chest Fly",
  "type": "strength",
  "muscles": [
   "chest"
  ],
  "equipment": [
   "barbell"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Barbell%20Rolling%20Chest%20Fly",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-dumbbell-lunges",
  "name": "Dumbbell Lunges",
  "type": "strength",
  "muscles": [
   "legs/glutes"
  ],
  "equipment": [
   "dumbbells"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Dumbbell%20Lunges",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-barbell-back-squat",
  "name": "Barbell Back Squat",
  "type": "strength",
  "muscles": [
   "legs/glutes"
  ],
  "equipment": [
   "barbell"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Barbell%20Back%20Squat",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-dumbbell-romanian-deadlift",
  "name": "Dumbbell Romanian Deadlift",
  "type": "strength",
  "muscles": [
   "legs/glutes"
  ],
  "equipment": [
   "dumbbells"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Dumbbell%20Romanian%20Deadlift",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-dumbbell-step-up",
  "name": "Dumbbell Step-up",
  "type": "strength",
  "muscles": [
   "legs/glutes"
  ],
  "equipment": [
   "dumbbells"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Dumbbell%20Step-up",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-dumbbell-leg-curl",
  "name": "Dumbbell Leg Curl",
  "type": "strength",
  "muscles": [
   "legs/glutes"
  ],
  "equipment": [
   "dumbbells"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Dumbbell%20Leg%20Curl",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-barbell-hip-thrust",
  "name": "Barbell Hip Thrust",
  "type": "strength",
  "muscles": [
   "legs/glutes"
  ],
  "equipment": [
   "barbell"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Barbell%20Hip%20Thrust",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-dumbbell-calf-raises",
  "name": "Dumbbell Calf Raises",
  "type": "strength",
  "muscles": [
   "legs/glutes"
  ],
  "equipment": [
   "dumbbells"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Dumbbell%20Calf%20Raises",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-barbell-front-squat",
  "name": "Barbell Front Squat",
  "type": "strength",
  "muscles": [
   "legs/glutes"
  ],
  "equipment": [
   "barbell"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Barbell%20Front%20Squat",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-barbell-hack-squat",
  "name": "Barbell Hack Squat",
  "type": "strength",
  "muscles": [
   "legs/glutes"
  ],
  "equipment": [
   "barbell"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Barbell%20Hack%20Squat",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-dumbbell-sumo-squat",
  "name": "Dumbbell Sumo Squat",
  "type": "strength",
  "muscles": [
   "legs/glutes"
  ],
  "equipment": [
   "dumbbells"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Dumbbell%20Sumo%20Squat",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-dumbbell-leg-extension",
  "name": "Dumbbell Leg Extension",
  "type": "strength",
  "muscles": [
   "legs/glutes"
  ],
  "equipment": [
   "dumbbells"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Dumbbell%20Leg%20Extension",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-landmine-squat",
  "name": "Landmine Squat",
  "type": "strength",
  "muscles": [
   "legs/glutes"
  ],
  "equipment": [
   "landmine"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Landmine%20Squat",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-pistol-squat",
  "name": "Pistol Squat",
  "type": "strength",
  "muscles": [
   "legs/glutes"
  ],
  "equipment": [
   "bodyweight"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Pistol%20Squat",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-zercher-squat",
  "name": "Zercher Squat",
  "type": "strength",
  "muscles": [
   "legs/glutes"
  ],
  "equipment": [
   "free weights"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Zercher%20Squat",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-dumbbell-bulgarian-split-squat",
  "name": "Dumbbell Bulgarian Split Squat",
  "type": "strength",
  "muscles": [
   "legs/glutes"
  ],
  "equipment": [
   "dumbbells"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Dumbbell%20Bulgarian%20Split%20Squat",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-reverse-lunges",
  "name": "Reverse Lunges",
  "type": "strength",
  "muscles": [
   "legs/glutes"
  ],
  "equipment": [
   "free weights"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Reverse%20Lunges",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-dumbbell-glute-bridge",
  "name": "Dumbbell Glute Bridge",
  "type": "strength",
  "muscles": [
   "legs/glutes"
  ],
  "equipment": [
   "dumbbells"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Dumbbell%20Glute%20Bridge",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-dumbbell-good-morning",
  "name": "Dumbbell Good Morning",
  "type": "strength",
  "muscles": [
   "legs/glutes"
  ],
  "equipment": [
   "dumbbells"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Dumbbell%20Good%20Morning",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-single-leg-romanian-deadlift",
  "name": "Single-Leg Romanian Deadlift",
  "type": "strength",
  "muscles": [
   "legs/glutes"
  ],
  "equipment": [
   "free weights"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Single-Leg%20Romanian%20Deadlift",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-dumbbell-pop-squat",
  "name": "Dumbbell Pop Squat",
  "type": "strength",
  "muscles": [
   "legs/glutes"
  ],
  "equipment": [
   "dumbbells"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Dumbbell%20Pop%20Squat",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-military-press",
  "name": "Military Press",
  "type": "strength",
  "muscles": [
   "shoulder"
  ],
  "equipment": [
   "free weights"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Military%20Press",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-arnold-press",
  "name": "Arnold Press",
  "type": "strength",
  "muscles": [
   "shoulder"
  ],
  "equipment": [
   "free weights"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Arnold%20Press",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-alternating-front-raise",
  "name": "Alternating Front Raise",
  "type": "strength",
  "muscles": [
   "shoulder"
  ],
  "equipment": [
   "free weights"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Alternating%20Front%20Raise",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-dumbbell-lateral-raise",
  "name": "Dumbbell Lateral Raise",
  "type": "strength",
  "muscles": [
   "shoulder"
  ],
  "equipment": [
   "dumbbells"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Dumbbell%20Lateral%20Raise",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-rear-delt-dumbbell-raises",
  "name": "Rear Delt Dumbbell Raises",
  "type": "strength",
  "muscles": [
   "shoulder"
  ],
  "equipment": [
   "dumbbells"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Rear%20Delt%20Dumbbell%20Raises",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-barbell-shrug",
  "name": "Barbell Shrug",
  "type": "strength",
  "muscles": [
   "shoulder"
  ],
  "equipment": [
   "barbell"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Barbell%20Shrug",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-dumbbell-overhead-press",
  "name": "Dumbbell Overhead Press",
  "type": "strength",
  "muscles": [
   "shoulder"
  ],
  "equipment": [
   "dumbbells"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Dumbbell%20Overhead%20Press",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-chest-supported-incline-row",
  "name": "Chest-Supported Incline Row",
  "type": "strength",
  "muscles": [
   "shoulder"
  ],
  "equipment": [
   "bench"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Chest-Supported%20Incline%20Row",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-dumbbell-face-pull",
  "name": "Dumbbell Face Pull",
  "type": "strength",
  "muscles": [
   "shoulder"
  ],
  "equipment": [
   "dumbbells"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Dumbbell%20Face%20Pull",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-upright-row",
  "name": "Upright Row",
  "type": "strength",
  "muscles": [
   "shoulder"
  ],
  "equipment": [
   "free weights"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Upright%20Row",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-conventional-deadlift",
  "name": "Conventional Deadlift",
  "type": "strength",
  "muscles": [
   "back"
  ],
  "equipment": [
   "free weights"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Conventional%20Deadlift",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-bent-over-barbell-row",
  "name": "Bent Over Barbell Row",
  "type": "strength",
  "muscles": [
   "back"
  ],
  "equipment": [
   "barbell"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Bent%20Over%20Barbell%20Row",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-one-arm-dumbbell-rowing",
  "name": "One-Arm Dumbbell Rowing",
  "type": "strength",
  "muscles": [
   "back"
  ],
  "equipment": [
   "dumbbells"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=One-Arm%20Dumbbell%20Rowing",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-incline-dumbbell-row",
  "name": "Incline Dumbbell Row",
  "type": "strength",
  "muscles": [
   "back"
  ],
  "equipment": [
   "dumbbells",
   "bench"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Incline%20Dumbbell%20Row",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-incline-iyt-dumbbell-raises",
  "name": "Incline IYT Dumbbell Raises",
  "type": "strength",
  "muscles": [
   "back"
  ],
  "equipment": [
   "dumbbells",
   "bench"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Incline%20IYT%20Dumbbell%20Raises",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-pendlay-row",
  "name": "Pendlay Row",
  "type": "strength",
  "muscles": [
   "back"
  ],
  "equipment": [
   "free weights"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Pendlay%20Row",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-elevated-plank-row",
  "name": "Elevated Plank Row",
  "type": "strength",
  "muscles": [
   "back"
  ],
  "equipment": [
   "bodyweight"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Elevated%20Plank%20Row",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-t-bar-row",
  "name": "T-Bar Row",
  "type": "strength",
  "muscles": [
   "back"
  ],
  "equipment": [
   "T-bar"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=T-Bar%20Row",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-meadows-row",
  "name": "Meadows Row",
  "type": "strength",
  "muscles": [
   "back"
  ],
  "equipment": [
   "free weights"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Meadows%20Row",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-reverse-grip-bent-over-row",
  "name": "Reverse Grip Bent Over Row",
  "type": "strength",
  "muscles": [
   "back"
  ],
  "equipment": [
   "free weights"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Reverse%20Grip%20Bent%20Over%20Row",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-renegade-row",
  "name": "Renegade Row",
  "type": "strength",
  "muscles": [
   "back"
  ],
  "equipment": [
   "free weights"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Renegade%20Row",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-ez-bar-biceps-curl",
  "name": "EZ Bar Biceps Curl",
  "type": "strength",
  "muscles": [
   "biceps"
  ],
  "equipment": [
   "EZ bar"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=EZ%20Bar%20Biceps%20Curl",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-alternating-biceps-curl",
  "name": "Alternating Biceps Curl",
  "type": "strength",
  "muscles": [
   "biceps"
  ],
  "equipment": [
   "free weights"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Alternating%20Biceps%20Curl",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-spider-curl",
  "name": "Spider Curl",
  "type": "strength",
  "muscles": [
   "biceps"
  ],
  "equipment": [
   "free weights"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Spider%20Curl",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-hammer-curl",
  "name": "Hammer Curl",
  "type": "strength",
  "muscles": [
   "biceps"
  ],
  "equipment": [
   "free weights"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Hammer%20Curl",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-concentration-curl",
  "name": "Concentration Curl",
  "type": "strength",
  "muscles": [
   "biceps"
  ],
  "equipment": [
   "free weights"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Concentration%20Curl",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-straight-barbell-curl",
  "name": "Straight Barbell Curl",
  "type": "strength",
  "muscles": [
   "biceps"
  ],
  "equipment": [
   "barbell"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Straight%20Barbell%20Curl",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-incline-dumbbell-curl",
  "name": "Incline Dumbbell Curl",
  "type": "strength",
  "muscles": [
   "biceps"
  ],
  "equipment": [
   "dumbbells",
   "bench"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Incline%20Dumbbell%20Curl",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-zottoman-curl",
  "name": "Zottoman Curl",
  "type": "strength",
  "muscles": [
   "biceps"
  ],
  "equipment": [
   "free weights"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Zottoman%20Curl",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-drag-curl",
  "name": "Drag Curl",
  "type": "strength",
  "muscles": [
   "biceps"
  ],
  "equipment": [
   "free weights"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Drag%20Curl",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-preacher-curl",
  "name": "Preacher Curl",
  "type": "strength",
  "muscles": [
   "biceps"
  ],
  "equipment": [
   "bench"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Preacher%20Curl",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-ez-bar-triceps-extension-skull-crusher",
  "name": "EZ Bar Triceps Extension/Skull Crusher",
  "type": "strength",
  "muscles": [
   "triceps"
  ],
  "equipment": [
   "EZ bar"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=EZ%20Bar%20Triceps%20Extension/Skull%20Crusher",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-ez-standing-overhead-triceps-extension",
  "name": "EZ Standing Overhead Triceps Extension",
  "type": "strength",
  "muscles": [
   "triceps"
  ],
  "equipment": [
   "EZ bar"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=EZ%20Standing%20Overhead%20Triceps%20Extension",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-close-grip-barbell-bench-press",
  "name": "Close Grip Barbell Bench Press",
  "type": "strength",
  "muscles": [
   "triceps"
  ],
  "equipment": [
   "barbell",
   "bench"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Close%20Grip%20Barbell%20Bench%20Press",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-triceps-kickback",
  "name": "Triceps Kickback",
  "type": "strength",
  "muscles": [
   "triceps"
  ],
  "equipment": [
   "free weights"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Triceps%20Kickback",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-dumbbell-overhead-triceps-extension",
  "name": "Dumbbell Overhead Triceps Extension",
  "type": "strength",
  "muscles": [
   "triceps"
  ],
  "equipment": [
   "dumbbells"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Dumbbell%20Overhead%20Triceps%20Extension",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-one-arm-triceps-extension",
  "name": "One-Arm Triceps Extension",
  "type": "strength",
  "muscles": [
   "triceps"
  ],
  "equipment": [
   "free weights"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=One-Arm%20Triceps%20Extension",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-lying-prone-incline-triceps-kickback",
  "name": "Lying Prone Incline Triceps Kickback",
  "type": "strength",
  "muscles": [
   "triceps"
  ],
  "equipment": [
   "bench"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Lying%20Prone%20Incline%20Triceps%20Kickback",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-dumbbell-french-press",
  "name": "Dumbbell French Press",
  "type": "strength",
  "muscles": [
   "triceps"
  ],
  "equipment": [
   "dumbbells"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Dumbbell%20French%20Press",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-dumbbell-tate-press",
  "name": "Dumbbell Tate Press",
  "type": "strength",
  "muscles": [
   "triceps"
  ],
  "equipment": [
   "dumbbells"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Dumbbell%20Tate%20Press",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-dumbbell-oblique-twist",
  "name": "Dumbbell Oblique Twist",
  "type": "strength",
  "muscles": [
   "abs/obliques"
  ],
  "equipment": [
   "dumbbells"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Dumbbell%20Oblique%20Twist",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-plank-drags",
  "name": "Plank Drags",
  "type": "strength",
  "muscles": [
   "abs/obliques"
  ],
  "equipment": [
   "bodyweight"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Plank%20Drags",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-side-plank-hip-dips",
  "name": "Side Plank Hip Dips",
  "type": "strength",
  "muscles": [
   "abs/obliques"
  ],
  "equipment": [
   "bodyweight"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Side%20Plank%20Hip%20Dips",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-hollow-body-hold",
  "name": "Hollow Body Hold",
  "type": "strength",
  "muscles": [
   "abs/obliques"
  ],
  "equipment": [
   "bodyweight"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Hollow%20Body%20Hold",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-straight-arm-sit-up",
  "name": "Straight-arm Sit-up",
  "type": "strength",
  "muscles": [
   "abs/obliques"
  ],
  "equipment": [
   "bodyweight"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Straight-arm%20Sit-up",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-barbell-torso-twist",
  "name": "Barbell Torso Twist",
  "type": "strength",
  "muscles": [
   "abs/obliques"
  ],
  "equipment": [
   "barbell"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Barbell%20Torso%20Twist",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-reverse-crunches",
  "name": "Reverse Crunches",
  "type": "strength",
  "muscles": [
   "abs/obliques"
  ],
  "equipment": [
   "bodyweight"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Reverse%20Crunches",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-russian-twist",
  "name": "Russian Twist",
  "type": "strength",
  "muscles": [
   "abs/obliques"
  ],
  "equipment": [
   "free weights"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Russian%20Twist",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-dumbbell-plank-rotation",
  "name": "Dumbbell Plank Rotation",
  "type": "strength",
  "muscles": [
   "abs/obliques"
  ],
  "equipment": [
   "dumbbells",
   "bodyweight"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Dumbbell%20Plank%20Rotation",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 },
 {
  "id": "fw-barbell-rollout",
  "name": "Barbell Rollout",
  "type": "strength",
  "muscles": [
   "abs/obliques"
  ],
  "equipment": [
   "barbell"
  ],
  "defaultWeight": 0,
  "defaultSets": 3,
  "defaultReps": 8,
  "defaultRestSec": 90,
  "defaultDurationSec": 0,
  "sourceUrl": "https://exrx.net/Search?q=Barbell%20Rollout",
  "cues": [
   "Imported from free-weight exercise list. Review form and choose a comfortable starting load."
  ]
 }
];
