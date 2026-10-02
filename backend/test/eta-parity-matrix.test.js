'use strict';

process.env.TZ = 'America/El_Salvador';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const legacyEngine = require('./fixtures/legacy-eta-reference');
const {
  runCurrentEtaScenario,
  runLegacyEtaScenario
} = require('./support/eta-parity-snapshot');
const { compareEtaSnapshots } = require('../src/core/eta/eta-parity-comparator');

const REQUIRED_CATEGORIES = [
  'pin',
  'agencia a destino pin sin horarios',
  'punto fijo operativo',
  'origen abierto dentro de intervalo',
  'antes de apertura',
  'entre dos intervalos partidos',
  'dentro del segundo intervalo partido',
  'después del cierre con siguiente día operativo',
  'origen sin horarios',
  'destino diario con corte día anterior',
  'destino diario con corte mismo día',
  'entrega semanal con corte weekday aprobada',
  'entrega semanal rechazada por corte',
  'destino sin regla para el día',
  'destino con dos intervalos',
  'normalización de días con tilde/sin tilde',
  'cambio de mes',
  'año bisiesto',
  'apertura exacta',
  'cierre exacto',
  'día cerrado entre jornadas operativas',
  'corte semanal igual al día de entrega',
  'cambio de año',
  'fecha activa distinta de hoy',
  'límite de una ruta',
  'límite de cinco rutas'
];

const SCENARIOS = [
  {
    name: 'pin',
    origin: {
      is_pin: true,
      tipo: 'pin'
    },
    destination: {
      is_pin: true
    },
    dropoffDate: '2026-09-07',
    dropoffTime: '10:00',
    desiredDate: '2026-09-08',
    limit: 3
  },
  {
    name: 'agencia a destino pin sin horarios',
    origin: {
      tipo: 'agencia',
      horarios_operativos: [
        { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' }
      ]
    },
    destination: {
      is_pin: true
    },
    dropoffDate: '2026-09-07',
    dropoffTime: '10:00',
    desiredDate: '2026-09-08',
    limit: 3
  },
  {
    name: 'punto fijo operativo',
    origin: {
      tipo: 'punto fijo',
      horarios_operativos: [
        { dia_semana: 'Lunes', hora_apertura: '09:00', hora_cierre: '16:00' }
      ]
    },
    destination: {
      reglas_entrega: [
        { dia_entrega: 'diario', dia_corte_maximo: 'dia anterior' }
      ],
      horarios_operativos: [
        { dia_semana: 'Martes', hora_apertura: '09:00', hora_cierre: '17:00' }
      ]
    },
    dropoffDate: '2026-09-07',
    dropoffTime: '10:00',
    desiredDate: '2026-09-08',
    limit: 3
  },
  {
    name: 'origen abierto dentro de intervalo',
    origin: {
      tipo: 'agencia',
      horarios_operativos: [
        { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' }
      ]
    },
    destination: {
      reglas_entrega: [
        { dia_entrega: 'diario', dia_corte_maximo: 'dia anterior' }
      ],
      horarios_operativos: [
        { dia_semana: 'Martes', hora_apertura: '09:00', hora_cierre: '18:00' }
      ]
    },
    dropoffDate: '2026-09-07',
    dropoffTime: '10:30',
    desiredDate: '2026-09-08',
    limit: 3
  },
  {
    name: 'antes de apertura',
    origin: {
      tipo: 'agencia',
      horarios_operativos: [
        { dia_semana: 'Lunes', hora_apertura: '09:00', hora_cierre: '17:00' }
      ]
    },
    destination: {
      reglas_entrega: [
        { dia_entrega: 'diario', dia_corte_maximo: 'dia anterior' }
      ],
      horarios_operativos: [
        { dia_semana: 'Martes', hora_apertura: '09:00', hora_cierre: '18:00' }
      ]
    },
    dropoffDate: '2026-09-07',
    dropoffTime: '07:45',
    desiredDate: '2026-09-08',
    limit: 3
  },
  {
    name: 'entre dos intervalos partidos',
    origin: {
      tipo: 'agencia',
      horarios_operativos: [
        { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '12:00' },
        { dia_semana: 'Lunes', hora_apertura: '14:00', hora_cierre: '18:00' }
      ]
    },
    destination: {
      reglas_entrega: [
        { dia_entrega: 'diario', dia_corte_maximo: 'dia anterior' }
      ],
      horarios_operativos: [
        { dia_semana: 'Martes', hora_apertura: '09:00', hora_cierre: '18:00' }
      ]
    },
    dropoffDate: '2026-09-07',
    dropoffTime: '13:00',
    desiredDate: '2026-09-08',
    limit: 3
  },
  {
    name: 'dentro del segundo intervalo partido',
    origin: {
      tipo: 'agencia',
      horarios_operativos: [
        { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '12:00' },
        { dia_semana: 'Lunes', hora_apertura: '14:00', hora_cierre: '18:00' }
      ]
    },
    destination: {
      reglas_entrega: [
        { dia_entrega: 'diario', dia_corte_maximo: 'dia anterior' }
      ],
      horarios_operativos: [
        { dia_semana: 'Martes', hora_apertura: '09:00', hora_cierre: '18:00' }
      ]
    },
    dropoffDate: '2026-09-07',
    dropoffTime: '15:30',
    desiredDate: '2026-09-08',
    limit: 3
  },
  {
    name: 'después del cierre con siguiente día operativo',
    origin: {
      tipo: 'agencia',
      horarios_operativos: [
        { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' },
        { dia_semana: 'Miércoles', hora_apertura: '08:00', hora_cierre: '17:00' }
      ]
    },
    destination: {
      reglas_entrega: [
        { dia_entrega: 'diario', dia_corte_maximo: 'dia anterior' }
      ],
      horarios_operativos: [
        { dia_semana: 'Jueves', hora_apertura: '09:00', hora_cierre: '18:00' }
      ]
    },
    dropoffDate: '2026-09-07',
    dropoffTime: '18:30',
    desiredDate: '2026-09-10',
    limit: 3
  },
  {
    name: 'origen sin horarios',
    origin: {
      tipo: 'agencia',
      horarios_operativos: []
    },
    destination: {
      reglas_entrega: [
        { dia_entrega: 'diario', dia_corte_maximo: 'dia anterior' }
      ],
      horarios_operativos: [
        { dia_semana: 'Martes', hora_apertura: '09:00', hora_cierre: '18:00' }
      ]
    },
    dropoffDate: '2026-09-07',
    dropoffTime: '10:00',
    desiredDate: '2026-09-08',
    limit: 3
  },
  {
    name: 'destino diario con corte día anterior',
    origin: {
      tipo: 'agencia',
      horarios_operativos: [
        { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' }
      ]
    },
    destination: {
      reglas_entrega: [
        { dia_entrega: 'diario', dia_corte_maximo: 'dia anterior' }
      ],
      horarios_operativos: [
        { dia_semana: 'Lunes', hora_apertura: '09:00', hora_cierre: '17:00' },
        { dia_semana: 'Martes', hora_apertura: '09:00', hora_cierre: '17:00' },
        { dia_semana: 'Miércoles', hora_apertura: '09:00', hora_cierre: '17:00' }
      ]
    },
    dropoffDate: '2026-09-07',
    dropoffTime: '10:00',
    desiredDate: '2026-09-08',
    limit: 3
  },
  {
    name: 'destino diario con corte mismo día',
    origin: {
      tipo: 'agencia',
      horarios_operativos: [
        { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' }
      ]
    },
    destination: {
      reglas_entrega: [
        { dia_entrega: 'diario', dia_corte_maximo: 'mismo dia' }
      ],
      horarios_operativos: [
        { dia_semana: 'Lunes', hora_apertura: '10:00', hora_cierre: '18:00' },
        { dia_semana: 'Martes', hora_apertura: '10:00', hora_cierre: '18:00' }
      ]
    },
    dropoffDate: '2026-09-07',
    dropoffTime: '09:00',
    desiredDate: '2026-09-07',
    limit: 3
  },
  {
    name: 'entrega semanal con corte weekday aprobada',
    origin: {
      tipo: 'agencia',
      horarios_operativos: [
        { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' }
      ]
    },
    destination: {
      reglas_entrega: [
        { dia_entrega: 'Viernes', dia_corte_maximo: 'Miércoles' }
      ],
      horarios_operativos: [
        { dia_semana: 'Viernes', hora_apertura: '09:00', hora_cierre: '17:00' }
      ]
    },
    dropoffDate: '2026-09-07',
    dropoffTime: '10:00',
    desiredDate: '2026-09-11',
    limit: 3
  },
  {
    name: 'entrega semanal rechazada por corte',
    origin: {
      tipo: 'agencia',
      horarios_operativos: [
        { dia_semana: 'Jueves', hora_apertura: '08:00', hora_cierre: '17:00' }
      ]
    },
    destination: {
      reglas_entrega: [
        { dia_entrega: 'Viernes', dia_corte_maximo: 'Miércoles' }
      ],
      horarios_operativos: [
        { dia_semana: 'Viernes', hora_apertura: '09:00', hora_cierre: '17:00' }
      ]
    },
    dropoffDate: '2026-09-10',
    dropoffTime: '10:00',
    desiredDate: '2026-09-11',
    limit: 3
  },
  {
    name: 'destino sin regla para el día',
    origin: {
      tipo: 'agencia',
      horarios_operativos: [
        { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' }
      ]
    },
    destination: {
      reglas_entrega: [
        { dia_entrega: 'Viernes', dia_corte_maximo: 'Miércoles' }
      ],
      horarios_operativos: [
        { dia_semana: 'Viernes', hora_apertura: '09:00', hora_cierre: '17:00' }
      ]
    },
    dropoffDate: '2026-09-07',
    dropoffTime: '10:00',
    desiredDate: '2026-09-08',
    limit: 3
  },
  {
    name: 'destino con dos intervalos',
    origin: {
      tipo: 'agencia',
      horarios_operativos: [
        { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' }
      ]
    },
    destination: {
      reglas_entrega: [
        { dia_entrega: 'diario', dia_corte_maximo: 'dia anterior' }
      ],
      horarios_operativos: [
        { dia_semana: 'Martes', hora_apertura: '08:00', hora_cierre: '12:00' },
        { dia_semana: 'Martes', hora_apertura: '13:00', hora_cierre: '17:00' }
      ]
    },
    dropoffDate: '2026-09-07',
    dropoffTime: '10:00',
    desiredDate: '2026-09-08',
    limit: 3
  },
  {
    name: 'normalización de días con tilde/sin tilde',
    origin: {
      tipo: 'agencia',
      horarios_operativos: [
        { dia_semana: 'miercoles', hora_apertura: '08:30', hora_cierre: '16:30' }
      ]
    },
    destination: {
      reglas_entrega: [
        { dia_entrega: 'Sábado', dia_corte_maximo: 'Jueves' }
      ],
      horarios_operativos: [
        { dia_semana: 'sabado', hora_apertura: '09:00', hora_cierre: '15:00' }
      ]
    },
    dropoffDate: '2026-09-09',
    dropoffTime: '11:00',
    desiredDate: '2026-09-12',
    limit: 3
  },
  {
    name: 'cambio de mes',
    origin: {
      tipo: 'agencia',
      horarios_operativos: [
        { dia_semana: 'Miércoles', hora_apertura: '08:00', hora_cierre: '17:00' },
        { dia_semana: 'Jueves', hora_apertura: '08:00', hora_cierre: '17:00' }
      ]
    },
    destination: {
      reglas_entrega: [
        { dia_entrega: 'diario', dia_corte_maximo: 'dia anterior' }
      ],
      horarios_operativos: [
        { dia_semana: 'Viernes', hora_apertura: '09:00', hora_cierre: '17:00' }
      ]
    },
    dropoffDate: '2026-09-30',
    dropoffTime: '19:00',
    desiredDate: '2026-10-02',
    limit: 3
  },
  {
    name: 'año bisiesto',
    origin: {
      tipo: 'agencia',
      horarios_operativos: [
        { dia_semana: 'Miércoles', hora_apertura: '08:00', hora_cierre: '17:00' },
        { dia_semana: 'Jueves', hora_apertura: '08:00', hora_cierre: '17:00' }
      ]
    },
    destination: {
      reglas_entrega: [
        { dia_entrega: 'diario', dia_corte_maximo: 'dia anterior' }
      ],
      horarios_operativos: [
        { dia_semana: 'Viernes', hora_apertura: '09:00', hora_cierre: '17:00' }
      ]
    },
    dropoffDate: '2024-02-28',
    dropoffTime: '19:30',
    desiredDate: '2024-03-01',
    limit: 3
  },
  {
    name: 'apertura exacta',
    origin: {
      tipo: 'agencia',
      horarios_operativos: [
        { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' }
      ]
    },
    destination: {
      reglas_entrega: [
        { dia_entrega: 'diario', dia_corte_maximo: 'dia anterior' }
      ],
      horarios_operativos: [
        { dia_semana: 'Martes', hora_apertura: '09:00', hora_cierre: '17:00' }
      ]
    },
    dropoffDate: '2026-09-07',
    dropoffTime: '08:00',
    desiredDate: '2026-09-08',
    limit: 3
  },
  {
    name: 'cierre exacto',
    origin: {
      tipo: 'agencia',
      horarios_operativos: [
        { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' }
      ]
    },
    destination: {
      reglas_entrega: [
        { dia_entrega: 'diario', dia_corte_maximo: 'dia anterior' }
      ],
      horarios_operativos: [
        { dia_semana: 'Martes', hora_apertura: '09:00', hora_cierre: '17:00' }
      ]
    },
    dropoffDate: '2026-09-07',
    dropoffTime: '17:00',
    desiredDate: '2026-09-08',
    limit: 3
  },
  {
    name: 'día cerrado entre jornadas operativas',
    origin: {
      tipo: 'agencia',
      horarios_operativos: [
        { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' },
        { dia_semana: 'Miércoles', hora_apertura: '08:00', hora_cierre: '17:00' }
      ]
    },
    destination: {
      reglas_entrega: [
        { dia_entrega: 'diario', dia_corte_maximo: 'dia anterior' }
      ],
      horarios_operativos: [
        { dia_semana: 'Jueves', hora_apertura: '09:00', hora_cierre: '17:00' }
      ]
    },
    dropoffDate: '2026-09-08',
    dropoffTime: '10:00',
    desiredDate: '2026-09-10',
    limit: 3
  },
  {
    name: 'corte semanal igual al día de entrega',
    origin: {
      tipo: 'agencia',
      horarios_operativos: [
        { dia_semana: 'Jueves', hora_apertura: '08:00', hora_cierre: '17:00' }
      ]
    },
    destination: {
      reglas_entrega: [
        { dia_entrega: 'Viernes', dia_corte_maximo: 'Viernes' }
      ],
      horarios_operativos: [
        { dia_semana: 'Viernes', hora_apertura: '09:00', hora_cierre: '17:00' }
      ]
    },
    dropoffDate: '2026-09-10',
    dropoffTime: '10:00',
    desiredDate: '2026-09-11',
    limit: 3
  },
  {
    name: 'cambio de año',
    origin: {
      tipo: 'agencia',
      horarios_operativos: [
        { dia_semana: 'Jueves', hora_apertura: '08:00', hora_cierre: '17:00' },
        { dia_semana: 'Viernes', hora_apertura: '08:00', hora_cierre: '17:00' }
      ]
    },
    destination: {
      reglas_entrega: [
        { dia_entrega: 'diario', dia_corte_maximo: 'dia anterior' }
      ],
      horarios_operativos: [
        { dia_semana: 'Sábado', hora_apertura: '09:00', hora_cierre: '14:00' }
      ]
    },
    dropoffDate: '2026-12-31',
    dropoffTime: '18:00',
    desiredDate: '2027-01-02',
    limit: 3
  },
  {
    name: 'fecha activa distinta de hoy',
    origin: {
      tipo: 'agencia',
      horarios_operativos: [
        { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' }
      ]
    },
    destination: {
      reglas_entrega: [
        { dia_entrega: 'diario', dia_corte_maximo: 'dia anterior' }
      ],
      horarios_operativos: [
        { dia_semana: 'Martes', hora_apertura: '09:00', hora_cierre: '17:00' }
      ]
    },
    dropoffDate: '2026-09-07',
    dropoffTime: '10:00',
    today: '2026-09-06',
    desiredDate: '2026-09-08',
    limit: 3
  },
  {
    name: 'límite de una ruta',
    origin: {
      tipo: 'agencia',
      horarios_operativos: [
        { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' }
      ]
    },
    destination: {
      reglas_entrega: [
        { dia_entrega: 'diario', dia_corte_maximo: 'dia anterior' }
      ],
      horarios_operativos: [
        { dia_semana: 'Martes', hora_apertura: '09:00', hora_cierre: '17:00' },
        { dia_semana: 'Miércoles', hora_apertura: '09:00', hora_cierre: '17:00' }
      ]
    },
    dropoffDate: '2026-09-07',
    dropoffTime: '10:00',
    desiredDate: '2026-09-08',
    limit: 1
  },
  {
    name: 'límite de cinco rutas',
    origin: {
      tipo: 'agencia',
      horarios_operativos: [
        { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' }
      ]
    },
    destination: {
      reglas_entrega: [
        { dia_entrega: 'diario', dia_corte_maximo: 'dia anterior' }
      ],
      horarios_operativos: [
        { dia_semana: 'Martes', hora_apertura: '09:00', hora_cierre: '17:00' },
        { dia_semana: 'Miércoles', hora_apertura: '09:00', hora_cierre: '17:00' },
        { dia_semana: 'Jueves', hora_apertura: '09:00', hora_cierre: '17:00' },
        { dia_semana: 'Viernes', hora_apertura: '09:00', hora_cierre: '17:00' },
        { dia_semana: 'Sábado', hora_apertura: '09:00', hora_cierre: '13:00' }
      ]
    },
    dropoffDate: '2026-09-07',
    dropoffTime: '10:00',
    desiredDate: '2026-09-08',
    limit: 5
  }
];

const ORIGINAL_SCENARIOS = structuredClone(SCENARIOS);

describe('T43b - Frozen Legacy Reference Contract', () => {
  test('matrix process uses the explicit America/El_Salvador timezone', () => {
    assert.equal(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      'America/El_Salvador'
    );
  });

  test('legacy reference commit is exactly 87684cbbca2f9e959d9c78f7fc3cc02c8e7895a4', () => {
    assert.equal(
      legacyEngine.LEGACY_REFERENCE_COMMIT,
      '87684cbbca2f9e959d9c78f7fc3cc02c8e7895a4',
      'LEGACY_REFERENCE_COMMIT must match the frozen reference commit'
    );
  });

  test('legacy instrumentation is non-enumerable and preserves the public result shape', () => {
    const result = legacyEngine.calcularIngresoOficial(
      SCENARIOS[0].origin,
      SCENARIOS[0].dropoffDate,
      SCENARIOS[0].dropoffTime,
      new Date(`${SCENARIOS[0].dropoffDate}T00:00:00`)
    );

    assert.deepEqual(Object.keys(result).sort(), ['date', 'msg']);
    assert.equal(result[legacyEngine.LEGACY_PARITY_META].status, 'PIN');
  });
});

describe('T43b - Scenario Matrix Structure & Completeness', () => {
  test('matrix contains at least 26 scenarios and covers all required categories by name', () => {
    assert.ok(
      SCENARIOS.length >= 26,
      `Expected at least 26 scenarios, found ${SCENARIOS.length}`
    );

    const scenarioNames = new Set(SCENARIOS.map((s) => s.name));
    for (const category of REQUIRED_CATEGORIES) {
      assert.ok(
        scenarioNames.has(category),
        `Required category "${category}" must be present in SCENARIOS by name`
      );
    }
  });

  test('every scenario contains origin, destination, dropoffDate, dropoffTime, desiredDate, and limit', () => {
    for (const scenario of SCENARIOS) {
      assert.ok(scenario.origin !== undefined, `Scenario "${scenario.name}" missing origin`);
      assert.ok(scenario.destination !== undefined, `Scenario "${scenario.name}" missing destination`);
      assert.ok(typeof scenario.dropoffDate === 'string', `Scenario "${scenario.name}" missing dropoffDate string`);
      assert.ok(typeof scenario.dropoffTime === 'string', `Scenario "${scenario.name}" missing dropoffTime string`);
      assert.ok(typeof scenario.desiredDate === 'string', `Scenario "${scenario.name}" missing desiredDate string`);
      assert.ok(typeof scenario.limit === 'number', `Scenario "${scenario.name}" missing numeric limit`);
    }
  });
});

describe('T43b - Scenario Matrix Immutability', () => {
  test('non-mutation: scenarios remain unchanged after both engine executions', () => {
    for (const scenario of SCENARIOS) {
      const before = structuredClone(scenario);
      const legacyInput = structuredClone(scenario);
      const currentInput = structuredClone(scenario);

      runLegacyEtaScenario(legacyEngine, legacyInput);
      runCurrentEtaScenario(currentInput);

      assert.deepEqual(
        legacyInput,
        before,
        `Legacy engine mutated its input for scenario "${scenario.name}"`
      );
      assert.deepEqual(
        currentInput,
        before,
        `Current engine mutated its input for scenario "${scenario.name}"`
      );
      assert.deepEqual(scenario, before, `Scenario "${scenario.name}" was mutated during execution`);
    }

    assert.deepEqual(
      SCENARIOS,
      ORIGINAL_SCENARIOS,
      'SCENARIOS matrix was mutated during engine executions'
    );
  });
});

describe('T43b - ETA Parity Matrix Execution', () => {
  for (const scenario of SCENARIOS) {
    test(`scenario parity: ${scenario.name}`, () => {
      const legacyInput = structuredClone(scenario);
      const currentInput = structuredClone(scenario);

      const legacySnapshot = runLegacyEtaScenario(legacyEngine, legacyInput);
      const currentSnapshot = runCurrentEtaScenario(currentInput);

      const comparison = compareEtaSnapshots(legacySnapshot, currentSnapshot);
      const failureMessage = `Scenario "${scenario.name}" parity mismatch:\n${JSON.stringify(comparison.differences, null, 2)}`;

      assert.equal(comparison.matches, true, failureMessage);
      assert.deepEqual(comparison.differences, [], failureMessage);
    });
  }
});
