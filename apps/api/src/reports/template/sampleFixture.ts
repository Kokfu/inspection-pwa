import { buildReportViewModel, companyProfile, summaryMainFinding, type SystemPage, type ReportViewModel } from "../reportViewModel.js";
// Sample values transcribed from the approved HTML. Not accepted production data.
const pages = [
  {
    "no": 1,
    "systemKey": "automatic_sprinkler",
    "title": "Automatic Sprinkler System",
    "location": "Pump Room, Block A · Zone: Zone 1",
    "condition": "REFER DETAIL PAGE",
    "conditionDetail": "",
    "structure": "v7",
    "blocks": [
      {
        "key": "sample_0",
        "sectionKey": "sample",
        "sectionTitle": "Water Tank",
        "title": "Water Tank",
        "kind": "checklist",
        "rows": [
          {
            "no": 1,
            "key": "row0",
            "label": "S.A.J Main Water Supply",
            "unit": null,
            "reading": null,
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          },
          {
            "no": 2,
            "key": "row1",
            "label": "Water Level",
            "unit": null,
            "reading": null,
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": "Full"
          },
          {
            "no": 3,
            "key": "row2",
            "label": "Automatic Refilling Facilities",
            "unit": null,
            "reading": null,
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          },
          {
            "no": 4,
            "key": "row3",
            "label": "Drain Valve In Close Position And All Stop Valve In Open Position",
            "unit": null,
            "reading": null,
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          }
        ]
      },
      {
        "key": "sample_1",
        "sectionKey": "sample",
        "sectionTitle": "Main Alarm Valve",
        "title": "Main Alarm Valve",
        "kind": "checklist",
        "rows": [
          {
            "no": 1,
            "key": "row0",
            "label": "Breaching Inlet In Good Serviceable",
            "unit": "–",
            "reading": "–",
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          },
          {
            "no": 2,
            "key": "row1",
            "label": "Alarm Gong In Function",
            "unit": "–",
            "reading": "–",
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          },
          {
            "no": 3,
            "key": "row2",
            "label": "Water Supply Gauge",
            "unit": "PSI",
            "reading": "125",
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          },
          {
            "no": 4,
            "key": "row3",
            "label": "Installation Gauge",
            "unit": "PSI",
            "reading": "120",
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          },
          {
            "no": 5,
            "key": "row4",
            "label": "Flow Meter Valve Closed, All Other Valves Open",
            "unit": "–",
            "reading": "–",
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          }
        ]
      },
      {
        "key": "sample_2",
        "sectionKey": "sample",
        "sectionTitle": "Pump House",
        "title": "Pump House",
        "kind": "checklist",
        "rows": [
          {
            "no": 1,
            "key": "row0",
            "label": "Keep Clean In Pump House",
            "unit": "–",
            "reading": "–",
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          },
          {
            "no": 2,
            "key": "row1",
            "label": "Manual Start Jockey Pump, Duty Pump & Stand-by Pump",
            "unit": "–",
            "reading": "–",
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          },
          {
            "no": 3,
            "key": "row2",
            "label": "Jockey Pump Correct Cut In / Cut Out",
            "unit": "PSI",
            "reading": "110 / 140",
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          },
          {
            "no": 4,
            "key": "row3",
            "label": "Correct Duty Pump Cut In",
            "unit": "PSI",
            "reading": "95",
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          },
          {
            "no": 5,
            "key": "row4",
            "label": "Correct Stand-by Pump Cut In",
            "unit": "PSI",
            "reading": "80",
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          },
          {
            "no": 6,
            "key": "row5",
            "label": "Stand-by Pump Water, Oil, Fuel, Belt and etc.",
            "unit": "–",
            "reading": "–",
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": "Diesel 3/4"
          },
          {
            "no": 7,
            "key": "row6",
            "label": "Correct Operation Of Battery Charging Alternator",
            "unit": "–",
            "reading": "–",
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          },
          {
            "no": 8,
            "key": "row7",
            "label": "Battery In Good Serviceable",
            "unit": "–",
            "reading": "–",
            "result": {
              "value": "complete_repair",
              "display": "COMPLETE REPAIR",
              "tone": "repair",
              "finding": true
            },
            "remark": "Battery 2 weak (11.2 V); replaced with 12 V 100 Ah on site."
          },
          {
            "no": 9,
            "key": "row8",
            "label": "Pump Run / Phase Failure Alarm Signal To Main Alarm Panel",
            "unit": "–",
            "reading": "–",
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          },
          {
            "no": 10,
            "key": "row9",
            "label": "Jockey, Duty And Stand-by Pump In Auto Start Position",
            "unit": "–",
            "reading": "–",
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          },
          {
            "no": 11,
            "key": "row10",
            "label": "Test Valve In Close Position And All Gate Valve In Open Position",
            "unit": "–",
            "reading": "–",
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          }
        ]
      },
      {
        "key": "sample_3",
        "sectionKey": "sample",
        "sectionTitle": "Test Run Fire Pump 30 Minutes",
        "title": "Test Run Fire Pump 30 Minutes",
        "kind": "units",
        "units": [
          {
            "key": "unit0",
            "label": "Jockey Pump",
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": "—"
          },
          {
            "key": "unit1",
            "label": "Duty Pump",
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": "Ran 30 min, no abnormal noise."
          },
          {
            "key": "unit2",
            "label": "Stand-by Pump",
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": "Ran 30 min after battery change."
          }
        ]
      }
    ],
    "remarks": [
      {
        "no": 1,
        "text": "Pump House — Battery In Good Serviceable: COMPLETE REPAIR — Battery 2 weak (11.2 V); replaced with 12 V 100 Ah on site.",
        "result": {
          "value": "complete_repair",
          "display": "COMPLETE REPAIR",
          "tone": "repair",
          "finding": true
        }
      }
    ],
    "partsTally": [],
    "comments": "Sprinkler installation in normal standby condition on departure. All valves sealed.",
    "photos": [
      {
        "no": 1,
        "caption": "Pump House — Battery In Good Serviceable — Replaced battery installed",
        "field": "sample",
        "width": 600,
        "height": 300
      },
      {
        "no": 2,
        "caption": "Main Alarm Valve — Installation Gauge — 120 PSI",
        "field": "sample",
        "width": 600,
        "height": 300
      },
      {
        "no": 3,
        "caption": "Pump House — Overall — Pump room on departure",
        "field": "sample",
        "width": 600,
        "height": 300
      }
    ],
    "inspection": {
      "date": "18 SEPTEMBER 2026",
      "inspectedBy": [
        "MOHD HAFIZ",
        "TAN KAH SENG",
        "RAJ KUMAR"
      ]
    }
  },
  {
    "no": 2,
    "systemKey": "hose_reel",
    "title": "Hose Reel System",
    "location": "All floors · Drum type: Swing type · 14 units",
    "condition": "FAILED",
    "conditionDetail": "",
    "structure": "v7",
    "blocks": [
      {
        "key": "sample_0",
        "sectionKey": "sample",
        "sectionTitle": "Water Tank",
        "title": "Water Tank",
        "kind": "checklist",
        "rows": [
          {
            "no": 1,
            "key": "row0",
            "label": "S.A.J Main Water Supply",
            "unit": null,
            "reading": null,
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          },
          {
            "no": 2,
            "key": "row1",
            "label": "Water Level",
            "unit": null,
            "reading": null,
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          },
          {
            "no": 3,
            "key": "row2",
            "label": "Automatic Refilling Facilities",
            "unit": null,
            "reading": null,
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          },
          {
            "no": 4,
            "key": "row3",
            "label": "Drain Valve In Close Position And All Stop Valve",
            "unit": null,
            "reading": null,
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          }
        ]
      },
      {
        "key": "sample_1",
        "sectionKey": "sample",
        "sectionTitle": "Test Run Fire Pump 30 Minutes",
        "title": "Test Run Fire Pump 30 Minutes",
        "kind": "units",
        "units": [
          {
            "key": "unit0",
            "label": "Duty Pump",
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          },
          {
            "key": "unit1",
            "label": "Stand-by Pump",
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          }
        ]
      },
      {
        "key": "sample_2",
        "sectionKey": "sample",
        "sectionTitle": "Hose Reel Drum",
        "title": "Hose Reel Drum",
        "kind": "register",
        "columns": [
          {
            "key": "col0",
            "label": "Location",
            "kind": "text",
            "subColumns": null
          },
          {
            "key": "col1",
            "label": "Drum",
            "kind": "result",
            "subColumns": null
          },
          {
            "key": "col2",
            "label": "Hose",
            "kind": "result",
            "subColumns": null
          },
          {
            "key": "col3",
            "label": "Nozzle",
            "kind": "result",
            "subColumns": null
          },
          {
            "key": "col4",
            "label": "Valve",
            "kind": "result",
            "subColumns": null
          },
          {
            "key": "col5",
            "label": "Nozzle Box",
            "kind": "result",
            "subColumns": null
          },
          {
            "key": "col6",
            "label": "Remarks",
            "kind": "remarks",
            "subColumns": null
          }
        ],
        "rows": [
          {
            "no": 1,
            "cells": [
              {
                "kind": "text",
                "text": "G/F Main Entrance"
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "remarks",
                "text": null
              }
            ]
          },
          {
            "no": 2,
            "cells": [
              {
                "kind": "text",
                "text": "G/F Production Line A"
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "remarks",
                "text": null
              }
            ]
          },
          {
            "no": 3,
            "cells": [
              {
                "kind": "text",
                "text": "G/F Production Line B"
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "na",
                  "display": "N/A",
                  "tone": "na",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "remarks",
                "text": "No nozzle box fitted"
              }
            ]
          },
          {
            "no": 4,
            "cells": [
              {
                "kind": "text",
                "text": "G/F Warehouse"
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "remarks",
                "text": null
              }
            ]
          },
          {
            "no": 5,
            "cells": [
              {
                "kind": "text",
                "text": "G/F Loading Bay"
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "remarks",
                "text": null
              }
            ]
          },
          {
            "no": 6,
            "cells": [
              {
                "kind": "text",
                "text": "1/F Lift Lobby"
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "remarks",
                "text": null
              }
            ]
          },
          {
            "no": 7,
            "cells": [
              {
                "kind": "text",
                "text": "1/F Office Corridor"
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "not_good",
                  "display": "NOT GOOD",
                  "tone": "bad",
                  "finding": true
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "remarks",
                "text": "Hose leaking at coupling"
              }
            ]
          },
          {
            "no": 8,
            "cells": [
              {
                "kind": "text",
                "text": "1/F Store Room"
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "remarks",
                "text": null
              }
            ]
          },
          {
            "no": 9,
            "cells": [
              {
                "kind": "text",
                "text": "2/F Lift Lobby"
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "complete_repair",
                  "display": "COMPLETE REPAIR",
                  "tone": "repair",
                  "finding": true
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "remarks",
                "text": "Nozzle tightened"
              }
            ]
          },
          {
            "no": 10,
            "cells": [
              {
                "kind": "text",
                "text": "2/F Production"
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "remarks",
                "text": null
              }
            ]
          },
          {
            "no": 11,
            "cells": [
              {
                "kind": "text",
                "text": "2/F Canteen"
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "not_good",
                  "display": "NOT GOOD",
                  "tone": "bad",
                  "finding": true
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "remarks",
                "text": "Nozzle missing"
              }
            ]
          },
          {
            "no": 12,
            "cells": [
              {
                "kind": "text",
                "text": "3/F Lift Lobby"
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "remarks",
                "text": null
              }
            ]
          },
          {
            "no": 13,
            "cells": [
              {
                "kind": "text",
                "text": "3/F Plant Room"
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "remarks",
                "text": null
              }
            ]
          },
          {
            "no": 14,
            "cells": [
              {
                "kind": "text",
                "text": "Roof Access"
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "remarks",
                "text": null
              }
            ]
          }
        ]
      }
    ],
    "remarks": [
      {
        "no": 1,
        "text": "Hose Reel Drum No. 7 (1/F Office Corridor) — Hose: NOT GOOD — Hose leaking at coupling.",
        "result": {
          "value": "not_good",
          "display": "NOT GOOD",
          "tone": "bad",
          "finding": true
        }
      },
      {
        "no": 2,
        "text": "Hose Reel Drum No. 11 (2/F Canteen) — Nozzle: NOT GOOD — Nozzle missing.",
        "result": {
          "value": "not_good",
          "display": "NOT GOOD",
          "tone": "bad",
          "finding": true
        }
      },
      {
        "no": 3,
        "text": "Hose Reel Drum No. 9 (2/F Lift Lobby) — Nozzle: COMPLETE REPAIR — Nozzle tightened.",
        "result": {
          "value": "complete_repair",
          "display": "COMPLETE REPAIR",
          "tone": "repair",
          "finding": true
        }
      }
    ],
    "partsTally": [
      {
        "component": "HOSE (30 M)",
        "count": 1,
        "text": "HOSE (30 M) X 1"
      },
      {
        "component": "NOZZLE",
        "count": 1,
        "text": "NOZZLE X 1"
      }
    ],
    "comments": null,
    "photos": [
      {
        "no": 1,
        "caption": "Drum No. 7 — Hose — Leak at coupling",
        "field": "sample",
        "width": 600,
        "height": 300
      },
      {
        "no": 2,
        "caption": "Drum No. 11 — Nozzle — Nozzle missing",
        "field": "sample",
        "width": 600,
        "height": 300
      }
    ],
    "inspection": {
      "date": "18 SEPTEMBER 2026",
      "inspectedBy": [
        "MOHD HAFIZ",
        "TAN KAH SENG",
        "RAJ KUMAR"
      ]
    }
  },
  {
    "no": 3,
    "systemKey": "fire_alarm_detector",
    "title": "Fire Alarm / Detector System",
    "location": "Main Fire Alarm Panel — Guard House · 6 zones",
    "condition": "GOOD CONDITIONS",
    "conditionDetail": "",
    "structure": "v7",
    "blocks": [
      {
        "key": "sample_0",
        "sectionKey": "sample",
        "sectionTitle": "Detector Test",
        "title": "Detector Test",
        "kind": "register",
        "columns": [
          {
            "key": "col0",
            "label": "Alarm Zone",
            "kind": "text",
            "subColumns": null
          },
          {
            "key": "col1",
            "label": "Location",
            "kind": "text",
            "subColumns": null
          },
          {
            "key": "col2",
            "label": "Manual Call Point",
            "kind": "nti",
            "subColumns": [
              "N",
              "T",
              "I"
            ]
          },
          {
            "key": "col3",
            "label": "Flow Switch",
            "kind": "nti",
            "subColumns": [
              "N",
              "T",
              "I"
            ]
          },
          {
            "key": "col4",
            "label": "Heat Detector",
            "kind": "nti",
            "subColumns": [
              "N",
              "T",
              "I"
            ]
          },
          {
            "key": "col5",
            "label": "Smoke Detector",
            "kind": "nti",
            "subColumns": [
              "N",
              "T",
              "I"
            ]
          }
        ],
        "rows": [
          {
            "no": 1,
            "cells": [
              {
                "kind": "text",
                "text": "Z-1"
              },
              {
                "kind": "text",
                "text": "Guard House"
              },
              {
                "kind": "nti",
                "state": {
                  "normal": true,
                  "test": true,
                  "isolation": false
                }
              },
              {
                "kind": "nti",
                "state": {
                  "normal": false,
                  "test": false,
                  "isolation": false
                }
              },
              {
                "kind": "nti",
                "state": {
                  "normal": true,
                  "test": true,
                  "isolation": false
                }
              },
              {
                "kind": "nti",
                "state": {
                  "normal": true,
                  "test": true,
                  "isolation": false
                }
              }
            ]
          },
          {
            "no": 2,
            "cells": [
              {
                "kind": "text",
                "text": "Z-2"
              },
              {
                "kind": "text",
                "text": "G/F Production"
              },
              {
                "kind": "nti",
                "state": {
                  "normal": true,
                  "test": true,
                  "isolation": false
                }
              },
              {
                "kind": "nti",
                "state": {
                  "normal": true,
                  "test": true,
                  "isolation": false
                }
              },
              {
                "kind": "nti",
                "state": {
                  "normal": true,
                  "test": true,
                  "isolation": false
                }
              },
              {
                "kind": "nti",
                "state": {
                  "normal": false,
                  "test": false,
                  "isolation": false
                }
              }
            ]
          },
          {
            "no": 3,
            "cells": [
              {
                "kind": "text",
                "text": "Z-3"
              },
              {
                "kind": "text",
                "text": "G/F Warehouse"
              },
              {
                "kind": "nti",
                "state": {
                  "normal": true,
                  "test": true,
                  "isolation": false
                }
              },
              {
                "kind": "nti",
                "state": {
                  "normal": true,
                  "test": true,
                  "isolation": false
                }
              },
              {
                "kind": "nti",
                "state": {
                  "normal": true,
                  "test": true,
                  "isolation": false
                }
              },
              {
                "kind": "nti",
                "state": {
                  "normal": false,
                  "test": false,
                  "isolation": false
                }
              }
            ]
          },
          {
            "no": 4,
            "cells": [
              {
                "kind": "text",
                "text": "Z-4"
              },
              {
                "kind": "text",
                "text": "1/F Office"
              },
              {
                "kind": "nti",
                "state": {
                  "normal": true,
                  "test": true,
                  "isolation": false
                }
              },
              {
                "kind": "nti",
                "state": {
                  "normal": false,
                  "test": false,
                  "isolation": false
                }
              },
              {
                "kind": "nti",
                "state": {
                  "normal": false,
                  "test": false,
                  "isolation": false
                }
              },
              {
                "kind": "nti",
                "state": {
                  "normal": true,
                  "test": true,
                  "isolation": false
                }
              }
            ]
          },
          {
            "no": 5,
            "cells": [
              {
                "kind": "text",
                "text": "Z-5"
              },
              {
                "kind": "text",
                "text": "2/F Production"
              },
              {
                "kind": "nti",
                "state": {
                  "normal": true,
                  "test": true,
                  "isolation": false
                }
              },
              {
                "kind": "nti",
                "state": {
                  "normal": true,
                  "test": true,
                  "isolation": false
                }
              },
              {
                "kind": "nti",
                "state": {
                  "normal": true,
                  "test": true,
                  "isolation": false
                }
              },
              {
                "kind": "nti",
                "state": {
                  "normal": false,
                  "test": false,
                  "isolation": false
                }
              }
            ]
          },
          {
            "no": 6,
            "cells": [
              {
                "kind": "text",
                "text": "Z-6"
              },
              {
                "kind": "text",
                "text": "3/F Plant Room"
              },
              {
                "kind": "nti",
                "state": {
                  "normal": true,
                  "test": true,
                  "isolation": false
                }
              },
              {
                "kind": "nti",
                "state": {
                  "normal": false,
                  "test": false,
                  "isolation": false
                }
              },
              {
                "kind": "nti",
                "state": {
                  "normal": true,
                  "test": true,
                  "isolation": false
                }
              },
              {
                "kind": "nti",
                "state": {
                  "normal": false,
                  "test": false,
                  "isolation": false
                }
              }
            ]
          }
        ]
      },
      {
        "key": "sample_1",
        "sectionKey": "sample",
        "sectionTitle": "Charger & Batteries",
        "title": "Charger & Batteries",
        "kind": "checklist",
        "rows": [
          {
            "no": 1,
            "key": "row0",
            "label": "Main Supply",
            "unit": "ON",
            "reading": "ON",
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          },
          {
            "no": 2,
            "key": "row1",
            "label": "Battery",
            "unit": "VDC",
            "reading": "26.8",
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          },
          {
            "no": 3,
            "key": "row2",
            "label": "Charger",
            "unit": "ON",
            "reading": "ON",
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          }
        ]
      },
      {
        "key": "sample_2",
        "sectionKey": "sample",
        "sectionTitle": "Timer",
        "title": "Timer",
        "kind": "checklist",
        "rows": [
          {
            "no": 1,
            "key": "row0",
            "label": "Timer for alarm ringing after flow switch detects signal",
            "unit": "SECONDS",
            "reading": "30",
            "result": null,
            "remark": null
          }
        ]
      },
      {
        "key": "sample_3",
        "sectionKey": "sample",
        "sectionTitle": "Main Function Key",
        "title": "Main Function Key",
        "kind": "checklist",
        "rows": [
          {
            "no": 1,
            "key": "row0",
            "label": "Main Alarm Reset",
            "unit": null,
            "reading": null,
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          },
          {
            "no": 2,
            "key": "row1",
            "label": "Lamp Test",
            "unit": null,
            "reading": null,
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          },
          {
            "no": 3,
            "key": "row2",
            "label": "Evacuate",
            "unit": null,
            "reading": null,
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          },
          {
            "no": 4,
            "key": "row3",
            "label": "A/C Supply",
            "unit": null,
            "reading": null,
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          },
          {
            "no": 5,
            "key": "row4",
            "label": "D/C Supply",
            "unit": null,
            "reading": null,
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          },
          {
            "no": 6,
            "key": "row5",
            "label": "SPKA System",
            "unit": null,
            "reading": null,
            "result": {
              "value": "na",
              "display": "N/A",
              "tone": "na",
              "finding": false
            },
            "remark": null
          },
          {
            "no": 7,
            "key": "row6",
            "label": "Alarm Lift Trip",
            "unit": null,
            "reading": null,
            "result": {
              "value": "good",
              "display": "GOOD",
              "tone": "good",
              "finding": false
            },
            "remark": null
          },
          {
            "no": 8,
            "key": "row7",
            "label": "Signal Gas Discharge",
            "unit": null,
            "reading": null,
            "result": {
              "value": "na",
              "display": "N/A",
              "tone": "na",
              "finding": false
            },
            "remark": null
          }
        ]
      },
      {
        "key": "sample_4",
        "sectionKey": "sample",
        "sectionTitle": "Alarm Bell & Manual Call Point",
        "title": "Alarm Bell & Manual Call Point",
        "kind": "register",
        "columns": [
          {
            "key": "col0",
            "label": "Location",
            "kind": "text",
            "subColumns": null
          },
          {
            "key": "col1",
            "label": "Alarm Bell",
            "kind": "result",
            "subColumns": null
          },
          {
            "key": "col2",
            "label": "Manual Call Point",
            "kind": "result",
            "subColumns": null
          },
          {
            "key": "col3",
            "label": "Remarks",
            "kind": "remarks",
            "subColumns": null
          }
        ],
        "rows": [
          {
            "no": 1,
            "cells": [
              {
                "kind": "text",
                "text": "Guard House"
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "remarks",
                "text": null
              }
            ]
          },
          {
            "no": 2,
            "cells": [
              {
                "kind": "text",
                "text": "G/F Production (east / west)"
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "remarks",
                "text": null
              }
            ]
          },
          {
            "no": 3,
            "cells": [
              {
                "kind": "text",
                "text": "G/F Warehouse"
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "remarks",
                "text": null
              }
            ]
          },
          {
            "no": 4,
            "cells": [
              {
                "kind": "text",
                "text": "1/F Office"
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "remarks",
                "text": null
              }
            ]
          },
          {
            "no": 5,
            "cells": [
              {
                "kind": "text",
                "text": "2/F Production"
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "remarks",
                "text": null
              }
            ]
          },
          {
            "no": 6,
            "cells": [
              {
                "kind": "text",
                "text": "3/F Plant Room"
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "result",
                "result": {
                  "value": "good",
                  "display": "GOOD",
                  "tone": "good",
                  "finding": false
                },
                "remark": null
              },
              {
                "kind": "remarks",
                "text": null
              }
            ]
          }
        ]
      }
    ],
    "remarks": [],
    "partsTally": [],
    "comments": "Panel in normal condition on departure. No zone isolated.",
    "photos": [],
    "inspection": {
      "date": "18 SEPTEMBER 2026",
      "inspectedBy": [
        "MOHD HAFIZ",
        "TAN KAH SENG",
        "RAJ KUMAR"
      ]
    }
  },
  {
    "no": 4,
    "systemKey": "portable_fire_extinguisher",
    "title": "Portable Fire Extinguisher",
    "location": "Whole premises",
    "condition": "GOOD CONDITIONS",
    "conditionDetail": "",
    "structure": "v7",
    "blocks": [
      {
        "key": "sample_0",
        "sectionKey": "sample",
        "sectionTitle": "Quantity Summary",
        "title": "Quantity Summary",
        "kind": "quantity",
        "rows": [
          {
            "key": "q0",
            "label": "9 kg Dry Powder Fire Extinguisher",
            "kind": "text",
            "value": "18 NOS",
            "isTotal": false
          },
          {
            "key": "q1",
            "label": "2 kg CO2 Portable Fire Extinguisher",
            "kind": "text",
            "value": "6 NOS",
            "isTotal": false
          },
          {
            "key": "q2",
            "label": "Total Fire Extinguisher",
            "kind": "text",
            "value": "24 NOS",
            "isTotal": true
          }
        ]
      }
    ],
    "remarks": [],
    "partsTally": [],
    "comments": "Next refill / expiry date: 12 SEP 2027. All units pressure gauge in green zone, safety pins and seals intact.",
    "photos": [],
    "inspection": {
      "date": "18 SEPTEMBER 2026",
      "inspectedBy": [
        "MOHD HAFIZ",
        "TAN KAH SENG",
        "RAJ KUMAR"
      ]
    }
  }
] as Array<Omit<SystemPage, "photos"> & {photos:Array<Omit<SystemPage["photos"][number], "content">>}>;
export function sampleViewModel(): ReportViewModel {
 const vm = buildReportViewModel({customer:"HOKUDEN (MALAYSIA) SDN. BHD.", site:"ZONE 1", serviceDate:"18 SEPTEMBER 2026", jobReference:"JOB-2026-0412", completedAt:"2026-09-18T08:40:00.000Z", completedBy:"MOHD HAFIZ BIN ISMAIL", systems:[], sections:[]});
 vm.company = {...companyProfile};
 Object.assign(vm.cover, {reportNumber:"MFE/SR/2026/0918-01", issuedAt:"18 SEP 2026",siteAddress:"LOT 12, JALAN PERINDUSTRIAN BUKIT PASIR, 84300 MUAR, JOHOR.",telephone:"06-986 1234",fax:"06-986 1235",contactPerson:"MR. LIM WEI JIAN",arrival:"09:05",departure:"16:40",serviceCallNumber:"SC-26-0918",contractNumber:"MFE/HKD/AMC/2026",frequency:"QUARTERLY",technicians:["MOHD HAFIZ","TAN KAH SENG","RAJ KUMAR"]});
 // Deterministic synthetic evidence: the approved template has PHOTO placeholders.
 const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
 vm.systemPages = structuredClone(pages).map(page => ({...page,photos:((page as unknown as {photos:Array<Omit<SystemPage["photos"][number],"content">>}).photos).map(photo=>({...photo,content:pixel}))}));
 vm.summary = vm.systemPages.map(page=>({no:page.no,systemKey:page.systemKey,label:page.title,location:page.location,frequency:"QUARTERLY",condition:page.condition,conditionDetail:page.conditionDetail,mainFinding:summaryMainFinding(page.remarks)}));
 // Keep the approved four-system sample fixed while the live catalog evolves.
 vm.cover.systemsServiced = vm.cover.systemsServiced.filter(system=>system.systemKey!=="fm200_fire_suppression");
 vm.cover.systemsServiced.forEach(system=>system.serviced=vm.systemPages.some(page=>page.systemKey===system.systemKey));
 return vm;
}

