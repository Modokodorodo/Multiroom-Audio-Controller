// Invented demo wiring. NEVER use this as a hardware mapping.
export const sources = [
  {id:'alexa', name:'Alexa', inputs:[{channel:9,group:'L'},{channel:10,group:'L'}]},
  {id:'music', name:'Music Assistant', inputs:[{channel:11,group:'L'},{channel:12,group:'L'}]},
  {id:'birds', name:'Bird sounds', inputs:[{channel:1,group:'M', mode:3}]}
];
export const rooms = [
  {id:'living', name:'Living room', outputs:[1,2], minDb:-60, maxDb:-10},
  {id:'kitchen', name:'Kitchen', outputs:[3], minDb:-60, maxDb:-15},
  {id:'toilet', name:'Toilet', outputs:[4], minDb:-60, maxDb:-20}
];
