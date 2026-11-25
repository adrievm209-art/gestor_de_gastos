/* ============================================================
   Gestor de Gastos
   Módulos: Utils, Toast, Store, State, Calculations, Cycle,
   Actions, Render y App. Sin frameworks, sin APIs externas.
   ============================================================ */
(() => {
  'use strict';

  const STORAGE_KEY = 'gestor-gastos-state-v1';

  const MONTH_NAMES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];

  const PERIODS = [
    { key: 'weekly', label: 'Semanal' },
    { key: 'fortnightly', label: 'Quincenal' },
    { key: 'monthly', label: 'Mensual' }
  ];

  const CATEGORIES = {
    income: {
      fixed: ['Salario', 'Honorarios recurrentes', 'Renta', 'Otros ingresos fijos'],
      extra: ['Bonificación', 'Reembolso', 'Venta', 'Regalo', 'Otros ingresos extra']
    },
    expense: {
      fixed: [
        'Arriendo', 'Mercado', 'Suscripciones', 'Mensualidades', 'Créditos por pagar',
        'Servicios públicos', 'Transporte', 'Seguros', 'Internet', 'Educación'
      ],
      extra: [
        'Salidas', 'Emergencias', 'Regalos', 'Caprichos', 'Ocio',
        'Viajes', 'Restaurantes', 'Compras', 'Salud', 'Mascotas'
      ]
    }
  };

  const THEMES = ['light', 'dark', 'brutal'];

  const HTML_ESCAPE = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  const TOAST_ICONS = {
    success: '✓',
    error: '!',
    warning: '⚠'
  };

  /* ------------------------------------------------------------
     Utilidades puras
     ------------------------------------------------------------ */
  const Utils = {
    round(value) {
      return Math.round((Number(value) || 0) * 100) / 100;
    },

    parseAmount(value) {
      const parsed = Number.parseFloat(String(value).replace(',', '.'));
      return Number.isFinite(parsed) ? Utils.round(parsed) : NaN;
    },

    createId() {
      return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    },

    currentMonthKey(date = new Date()) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      return `${year}-${month}`;
    },

    nextMonthKey(monthKey) {
      const [year, month] = monthKey.split('-').map(Number);
      const date = new Date(year, month - 1, 1);
      date.setMonth(date.getMonth() + 1);
      return Utils.currentMonthKey(date);
    },

    formatMonth(monthKey) {
      const [year, month] = monthKey.split('-').map(Number);
      const name = MONTH_NAMES[month - 1] || 'Mes';
      return `${name} ${year}`;
    },

    formatCurrency(value) {
      const number = Number(value) || 0;
      const absolute = new Intl.NumberFormat('es-ES', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }).format(Math.abs(number));
      return `${number < 0 ? '-' : ''}$${absolute}`;
    },

    escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (character) => HTML_ESCAPE[character]);
    },

    isDateInMonth(date, monthKey) {
      return typeof date === 'string' && date.startsWith(`${monthKey}-`);
    },

    toDateKey(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    },

    monthLength(monthKey) {
      const [year, month] = monthKey.split('-').map(Number);
      return new Date(year, month, 0).getDate();
    },

    dateInMonth(monthKey) {
      const today = new Date();
      const day = Math.min(today.getDate(), Utils.monthLength(monthKey));
      return `${monthKey}-${String(day).padStart(2, '0')}`;
    },

    getPeriodBounds(monthKey, period) {
      const [year, month] = monthKey.split('-').map(Number);
      const lastDay = Utils.monthLength(monthKey);
      const activeDay = Math.min(new Date().getDate(), lastDay);
      const pad = (day) => String(day).padStart(2, '0');

      if (period === 'month') {
        return {
          start: `${monthKey}-01`,
          end: `${monthKey}-${pad(lastDay)}`,
          label: `1-${lastDay}`
        };
      }

      if (period === 'fortnightly') {
        const firstHalf = activeDay <= 15;
        return {
          start: `${monthKey}-${pad(firstHalf ? 1 : 16)}`,
          end: `${monthKey}-${pad(firstHalf ? 15 : lastDay)}`,
          label: firstHalf ? `1-15` : `16-${lastDay}`
        };
      }

      const reference = new Date(year, month - 1, activeDay);
      const mondayOffset = (reference.getDay() + 6) % 7;
      reference.setDate(reference.getDate() - mondayOffset);
      const end = new Date(reference);
      end.setDate(end.getDate() + 6);

      return {
        start: Utils.toDateKey(reference),
        end: Utils.toDateKey(end),
        label: `${reference.getDate()}-${end.getDate()}`
      };
    }
  };

  /* ------------------------------------------------------------
     Notificaciones visuales
     ------------------------------------------------------------ */
  const Toast = {
    timer: null,

    show(message, type = 'success') {
      const element = document.getElementById('toast');
      if (!element) return;

      const icon = TOAST_ICONS[type] || TOAST_ICONS.success;
      element.innerHTML = `<span class="toast-icon" aria-hidden="true">${icon}</span><span>${Utils.escapeHtml(message)}</span>`;
      element.classList.toggle('toast--error', type === 'error');
      element.classList.add('is-visible');

      if (Toast.timer) clearTimeout(Toast.timer);
      Toast.timer = setTimeout(() => {
        element.classList.remove('is-visible');
        Toast.timer = null;
      }, 3200);
    }
  };

  /* ------------------------------------------------------------
     Persistencia en localStorage
     ------------------------------------------------------------ */
  const Store = {
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return State.createDefault();
        return State.normalize(JSON.parse(raw));
      } catch (error) {
        console.warn('No se pudo leer el estado guardado.', error);
        return State.createDefault();
      }
    },

    save(state) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (error) {
        console.warn('No se pudo guardar el estado.', error);
        Toast.show('No se pudo guardar en el navegador.', 'error');
      }
    }
  };

  /* ------------------------------------------------------------
     Estado y normalización
     ------------------------------------------------------------ */
  const State = {
    createDefault() {
      const month = Utils.currentMonthKey();
      return {
        version: 1,
        theme: 'light',
        currentMonth: month,
        emergencyFund: 0,
        monthlyEmergencyAllocation: 0,
        emergencyAllocations: { [month]: 0 },
        limits: { weekly: 0, fortnightly: 0, monthly: 0 },
        incomes: [],
        expenses: [],
        goals: [],
        goalTransactions: [],
        history: [],
        meta: { lastClosed: null }
      };
    },

    normalize(raw) {
      const base = State.createDefault();
      const source = raw && typeof raw === 'object' ? raw : {};
      const currentMonth = /^\d{4}-\d{2}$/.test(source.currentMonth || '')
        ? source.currentMonth
        : base.currentMonth;

      const state = {
        version: 1,
        theme: THEMES.includes(source.theme) ? source.theme : base.theme,
        currentMonth,
        emergencyFund: Number(source.emergencyFund) || 0,
        monthlyEmergencyAllocation: Number(source.monthlyEmergencyAllocation) || 0,
        emergencyAllocations: {},
        limits: { ...base.limits, ...(source.limits || {}) },
        incomes: State.cleanEntries(source.incomes),
        expenses: State.cleanEntries(source.expenses),
        goals: State.cleanGoals(source.goals),
        goalTransactions: State.cleanTransactions(source.goalTransactions),
        history: State.cleanHistory(source.history),
        meta: { ...base.meta, ...(source.meta || {}) }
      };

      const allocations = source.emergencyAllocations && typeof source.emergencyAllocations === 'object'
        ? source.emergencyAllocations
        : { [currentMonth]: state.monthlyEmergencyAllocation };

      Object.entries(allocations).forEach(([month, amount]) => {
        state.emergencyAllocations[month] = Number(amount) || 0;
      });

      if (!(currentMonth in state.emergencyAllocations)) {
        state.emergencyAllocations[currentMonth] = state.monthlyEmergencyAllocation;
      }

      Object.keys(state.limits).forEach((key) => {
        state.limits[key] = Math.max(0, Number(state.limits[key]) || 0);
      });

      return state;
    },

    cleanEntries(list) {
      if (!Array.isArray(list)) return [];
      return list
        .filter((item) => item && typeof item === 'object' && item.id && item.month)
        .map((item) => ({
          id: String(item.id),
          description: String(item.description || 'Sin descripción'),
          amount: Math.max(0, Number(item.amount) || 0),
          type: item.type === 'extra' ? 'extra' : 'fixed',
          category: String(item.category || 'Otros'),
          date: String(item.date || `${item.month}-01`),
          month: String(item.month),
          createdAt: String(item.createdAt || '')
        }));
    },

    cleanGoals(list) {
      if (!Array.isArray(list)) return [];
      return list
        .filter((goal) => goal && typeof goal === 'object' && goal.id)
        .map((goal) => ({
          id: String(goal.id),
          name: String(goal.name || 'Meta'),
          target: Math.max(0, Number(goal.target) || 0),
          monthlyContribution: Math.max(0, Number(goal.monthlyContribution) || 0),
          completed: Boolean(goal.completed),
          createdMonth: String(goal.createdMonth || Utils.currentMonthKey()),
          createdAt: String(goal.createdAt || '')
        }));
    },

    cleanTransactions(list) {
      if (!Array.isArray(list)) return [];
      return list
        .filter((item) => item && typeof item === 'object' && item.goalId && item.month)
        .map((item) => ({
          id: String(item.id || Utils.createId()),
          goalId: String(item.goalId),
          amount: Math.max(0, Number(item.amount) || 0),
          month: String(item.month),
          source: item.source === 'extra' ? 'extra' : 'monthly',
          date: String(item.date || `${item.month}-01`),
          createdAt: String(item.createdAt || '')
        }));
    },

    cleanHistory(list) {
      if (!Array.isArray(list)) return [];
      return list
        .filter((item) => item && typeof item === 'object' && item.month)
        .map((item) => ({
          month: String(item.month),
          totalIncome: Number(item.totalIncome) || 0,
          totalExpenses: Number(item.totalExpenses) || 0,
          emergencySaved: Number(item.emergencySaved) || 0,
          goalsSaved: Number(item.goalsSaved) || 0,
          leftover: Number(item.leftover) || 0,
          balance: Number(item.balance) || 0,
          createdAt: String(item.createdAt || '')
        }));
    }
  };

  /* ------------------------------------------------------------
     Cálculos del mes
     ------------------------------------------------------------ */
  const Calculations = {
    monthIncome(state, month = state.currentMonth) {
      return Utils.round(state.incomes
        .filter((item) => item.month === month)
        .reduce((total, item) => total + Number(item.amount || 0), 0));
    },

    monthExpenses(state, month = state.currentMonth) {
      return Utils.round(state.expenses
        .filter((item) => item.month === month)
        .reduce((total, item) => total + Number(item.amount || 0), 0));
    },

    goalSaved(goal, state) {
      return Utils.round(state.goalTransactions
        .filter((item) => item.goalId === goal.id)
        .reduce((total, item) => total + Number(item.amount || 0), 0));
    },

    goalSavedForMonth(state, month = state.currentMonth) {
      return Utils.round(state.goalTransactions
        .filter((item) => item.month === month)
        .reduce((total, item) => total + Number(item.amount || 0), 0));
    },

    configuredEmergency(state, month = state.currentMonth) {
      return Math.max(0, Number(state.emergencyAllocations[month]) || 0);
    },

    beforeEmergency(state, month = state.currentMonth) {
      return Utils.round(
        Calculations.monthIncome(state, month)
        - Calculations.monthExpenses(state, month)
        - Calculations.goalSavedForMonth(state, month)
      );
    },

    effectiveEmergency(state, month = state.currentMonth) {
      const configured = Calculations.configuredEmergency(state, month);
      return Utils.round(Math.min(configured, Math.max(0, Calculations.beforeEmergency(state, month))));
    },

    balance(state, month = state.currentMonth) {
      return Utils.round(Calculations.beforeEmergency(state, month) - Calculations.effectiveEmergency(state, month));
    },

    leftover(state, month = state.currentMonth) {
      return Utils.round(Math.max(0, Calculations.balance(state, month)));
    },

    projectedEmergency(state, month = state.currentMonth) {
      return Utils.round(Calculations.effectiveEmergency(state, month) + Calculations.leftover(state, month));
    },

    periodExpenses(state, period) {
      const bounds = Utils.getPeriodBounds(state.currentMonth, period);
      return Utils.round(state.expenses
        .filter((item) => item.month === state.currentMonth && item.date >= bounds.start && item.date <= bounds.end)
        .reduce((total, item) => total + Number(item.amount || 0), 0));
    },

    limitStatus(state, period) {
      const limit = Math.max(0, Number(state.limits[period]) || 0);
      const spent = Calculations.periodExpenses(state, period);
      const percent = limit > 0 ? (spent / limit) * 100 : 0;
      return { limit, spent, percent, isAlert: limit > 0 && percent >= 90 };
    },

    goalProgress(goal, state) {
      const saved = Calculations.goalSaved(goal, state);
      const target = Math.max(0, Number(goal.target) || 0);
      const percent = target > 0 ? Math.min(100, (saved / target) * 100) : 0;
      return { saved, target, percent, remaining: Math.max(0, target - saved) };
    }
  };

  /* ------------------------------------------------------------
     Cierre de ciclos mensuales
     ------------------------------------------------------------ */
  const Cycle = {
    rollover(state) {
      const today = Utils.currentMonthKey();
      let changed = false;
      let guard = 0;

      while (state.currentMonth < today && guard < 120) {
        Cycle.closeMonth(state, state.currentMonth, false);
        state.currentMonth = Utils.nextMonthKey(state.currentMonth);

        if (!(state.currentMonth in state.emergencyAllocations)) {
          state.emergencyAllocations[state.currentMonth] = Number(state.monthlyEmergencyAllocation) || 0;
        }

        Cycle.assignMonthlyGoals(state, state.currentMonth);
        changed = true;
        guard += 1;
      }

      return changed;
    },

    closeMonth(state, month) {
      if (state.history.some((item) => item.month === month)) return false;

      const totalIncome = Calculations.monthIncome(state, month);
      const totalExpenses = Calculations.monthExpenses(state, month);
      const goalsSaved = Calculations.goalSavedForMonth(state, month);
      const emergencyReserved = Calculations.effectiveEmergency(state, month);
      const leftover = Calculations.leftover(state, month);
      const emergencySaved = Utils.round(emergencyReserved + leftover);
      const balance = Calculations.balance(state, month);

      state.emergencyFund = Utils.round(Number(state.emergencyFund || 0) + emergencySaved);
      state.history.push({
        month,
        totalIncome,
        totalExpenses,
        emergencySaved,
        goalsSaved,
        leftover,
        balance,
        createdAt: new Date().toISOString()
      });
      state.meta.lastClosed = month;

      return true;
    },

    assignMonthlyGoals(state, month) {
      state.goals.forEach((goal) => {
        const progress = Calculations.goalProgress(goal, state);
        const monthly = Number(goal.monthlyContribution) || 0;

        if (goal.completed || monthly <= 0 || progress.remaining <= 0) return;

        const alreadyAssigned = state.goalTransactions.some((item) => (
          item.goalId === goal.id && item.month === month && item.source === 'monthly'
        ));
        if (alreadyAssigned) return;

        const amount = Utils.round(Math.min(monthly, progress.remaining));
        if (amount <= 0) return;

        state.goalTransactions.push({
          id: Utils.createId(),
          goalId: goal.id,
          amount,
          month,
          source: 'monthly',
          date: Utils.dateInMonth(month),
          createdAt: new Date().toISOString()
        });
      });
    }
  };

  /* ------------------------------------------------------------
     Acciones del usuario
     ------------------------------------------------------------ */
  const Actions = {
    state: null,

    populateCategories(kind, type) {
      const select = document.getElementById(`${kind}Category`);
      if (!select) return;

      const options = CATEGORIES[kind][type] || [];
      select.innerHTML = options
        .map((category) => `<option value="${Utils.escapeHtml(category)}">${Utils.escapeHtml(category)}</option>`)
        .join('');
    },

    setDefaultDates() {
      const incomeDate = document.getElementById('incomeDate');
      const expenseDate = document.getElementById('expenseDate');
      if (incomeDate) incomeDate.value = Utils.dateInMonth(Actions.state.currentMonth);
      if (expenseDate) expenseDate.value = Utils.dateInMonth(Actions.state.currentMonth);
    },

    resetForm(form, kind) {
      form.reset();
      Actions.populateCategories(kind, 'fixed');
      Actions.setDefaultDates();
    },

    addIncome(form) {
      const description = form.elements.namedItem('description').value.trim();
      const amount = Utils.parseAmount(form.elements.namedItem('amount').value);
      const type = form.elements.namedItem('type').value;
      const category = form.elements.namedItem('category').value;
      const date = form.elements.namedItem('date').value;

      if (!description || !Number.isFinite(amount) || amount <= 0 || !date) {
        Toast.show('Completa la descripción, el monto y la fecha.', 'error');
        return;
      }
      if (!Utils.isDateInMonth(date, Actions.state.currentMonth)) {
        Toast.show('La fecha debe pertenecer al mes activo.', 'error');
        return;
      }

      Actions.state.incomes.push({
        id: Utils.createId(),
        description,
        amount,
        type: type === 'extra' ? 'extra' : 'fixed',
        category,
        date,
        month: Actions.state.currentMonth,
        createdAt: new Date().toISOString()
      });

      Store.save(Actions.state);
      Actions.resetForm(form, 'income');
      Render.all();
      Toast.show('Ingreso registrado correctamente.');
    },

    addExpense(form) {
      const description = form.elements.namedItem('description').value.trim();
      const amount = Utils.parseAmount(form.elements.namedItem('amount').value);
      const type = form.elements.namedItem('type').value;
      const category = form.elements.namedItem('category').value;
      const date = form.elements.namedItem('date').value;

      if (!description || !Number.isFinite(amount) || amount <= 0 || !date) {
        Toast.show('Completa la descripción, el monto y la fecha.', 'error');
        return;
      }
      if (!Utils.isDateInMonth(date, Actions.state.currentMonth)) {
        Toast.show('La fecha debe pertenecer al mes activo.', 'error');
        return;
      }

      Actions.state.expenses.push({
        id: Utils.createId(),
        description,
        amount,
        type: type === 'extra' ? 'extra' : 'fixed',
        category,
        date,
        month: Actions.state.currentMonth,
        createdAt: new Date().toISOString()
      });

      Store.save(Actions.state);
      Actions.resetForm(form, 'expense');
      Render.all();
      Toast.show('Gasto registrado correctamente.');
    },

    setLimits(form) {
      const readLimit = (name) => {
        const raw = form.elements.namedItem(name).value.trim();
        return raw === '' ? 0 : Utils.parseAmount(raw);
      };
      const weekly = readLimit('weekly');
      const fortnightly = readLimit('fortnightly');
      const monthly = readLimit('monthly');
      const values = [weekly, fortnightly, monthly];

      if (values.some((value) => !Number.isFinite(value) || value < 0)) {
        Toast.show('Los límites deben ser números mayores o iguales a cero.', 'error');
        return;
      }

      Actions.state.limits = {
        weekly: Utils.round(weekly),
        fortnightly: Utils.round(fortnightly),
        monthly: Utils.round(monthly)
      };

      Store.save(Actions.state);
      Render.all();
      Toast.show('Límites actualizados.');
    },

    setAllocation(form) {
      const amount = Utils.parseAmount(form.elements.namedItem('amount').value);
      if (!Number.isFinite(amount) || amount < 0) {
        Toast.show('Ingresa un monto válido para emergencias.', 'error');
        return;
      }

      const rounded = Utils.round(amount);
      Actions.state.emergencyAllocations[Actions.state.currentMonth] = rounded;
      Actions.state.monthlyEmergencyAllocation = rounded;

      Store.save(Actions.state);
      Render.all();
      Toast.show('Aporte a emergencias actualizado.');
    },

    addGoal(form) {
      const name = form.elements.namedItem('name').value.trim();
      const target = Utils.parseAmount(form.elements.namedItem('target').value);
      const monthly = Utils.parseAmount(form.elements.namedItem('monthlyContribution').value);

      if (!name || !Number.isFinite(target) || target <= 0 || !Number.isFinite(monthly) || monthly <= 0) {
        Toast.show('Completa el nombre, el objetivo y el aporte mensual.', 'error');
        return;
      }

      const goal = {
        id: Utils.createId(),
        name,
        target: Utils.round(target),
        monthlyContribution: Utils.round(monthly),
        completed: false,
        createdMonth: Actions.state.currentMonth,
        createdAt: new Date().toISOString()
      };
      Actions.state.goals.push(goal);

      const contribution = Utils.round(Math.min(goal.monthlyContribution, goal.target));
      Actions.state.goalTransactions.push({
        id: Utils.createId(),
        goalId: goal.id,
        amount: contribution,
        month: Actions.state.currentMonth,
        source: 'monthly',
        date: Utils.dateInMonth(Actions.state.currentMonth),
        createdAt: new Date().toISOString()
      });
      if (contribution >= goal.target) goal.completed = true;

      Store.save(Actions.state);
      form.reset();
      Render.all();
      Toast.show('Meta creada y primer aporte reservado.');
    },

    contributeToGoal(goalId, form) {
      const goal = Actions.state.goals.find((item) => item.id === goalId);
      if (!goal) return;

      const amount = Utils.parseAmount(form.elements.namedItem('amount').value);
      if (!Number.isFinite(amount) || amount <= 0) {
        Toast.show('Ingresa un aporte mayor a cero.', 'error');
        return;
      }

      const progress = Calculations.goalProgress(goal, Actions.state);
      if (progress.remaining <= 0) {
        Toast.show('Esta meta ya está completada.', 'error');
        return;
      }

      const applied = Utils.round(Math.min(amount, progress.remaining));
      Actions.state.goalTransactions.push({
        id: Utils.createId(),
        goalId: goal.id,
        amount: applied,
        month: Actions.state.currentMonth,
        source: 'extra',
        date: Utils.dateInMonth(Actions.state.currentMonth),
        createdAt: new Date().toISOString()
      });

      if (progress.saved + applied >= goal.target - 0.001) {
        goal.completed = true;
      }

      Store.save(Actions.state);
      form.reset();
      Render.all();
      Toast.show(`Aporte de ${Utils.formatCurrency(applied)} registrado.`);
    },

    deleteEntry(action, id) {
      const isIncome = action === 'delete-income';
      const list = isIncome ? Actions.state.incomes : Actions.state.expenses;
      const item = list.find((entry) => entry.id === id);
      if (!item) return;

      const label = isIncome ? 'ingreso' : 'gasto';
      if (!window.confirm(`¿Eliminar el ${label} "${item.description}"?`)) return;

      if (isIncome) {
        Actions.state.incomes = Actions.state.incomes.filter((entry) => entry.id !== id);
      } else {
        Actions.state.expenses = Actions.state.expenses.filter((entry) => entry.id !== id);
      }

      Store.save(Actions.state);
      Render.all();
      Toast.show(`${isIncome ? 'Ingreso' : 'Gasto'} eliminado.`);
    },

    deleteGoal(id) {
      const goal = Actions.state.goals.find((item) => item.id === id);
      if (!goal) return;
      if (!window.confirm(`¿Eliminar la meta "${goal.name}" y sus aportes?`)) return;

      Actions.state.goals = Actions.state.goals.filter((item) => item.id !== id);
      Actions.state.goalTransactions = Actions.state.goalTransactions.filter((item) => item.goalId !== id);

      Store.save(Actions.state);
      Render.all();
      Toast.show('Meta eliminada.');
    },

    closeCurrentMonth() {
      const month = Actions.state.currentMonth;
      if (Actions.state.history.some((item) => item.month === month)) {
        Toast.show('Este mes ya fue archivado.', 'error');
        return;
      }
      if (!window.confirm(`¿Cerrar ${Utils.formatMonth(month)} y guardar el resumen?`)) return;

      const leftover = Calculations.leftover(Actions.state, month);
      Cycle.closeMonth(Actions.state, month);

      const next = Utils.nextMonthKey(month);
      Actions.state.currentMonth = next;
      if (!(next in Actions.state.emergencyAllocations)) {
        Actions.state.emergencyAllocations[next] = Number(Actions.state.monthlyEmergencyAllocation) || 0;
      }
      Cycle.assignMonthlyGoals(Actions.state, next);

      Store.save(Actions.state);
      Actions.setDefaultDates();
      Render.all();
      Toast.show(leftover > 0
        ? `Mes archivado. ${Utils.formatCurrency(leftover)} fueron a emergencias.`
        : 'Mes archivado correctamente.');
    },

    setTheme(theme) {
      if (!THEMES.includes(theme) || theme === Actions.state.theme) return;
      Actions.state.theme = theme;
      Store.save(Actions.state);
      Render.theme();
    },

    openResetDialog() {
      const dialog = document.getElementById('resetDialog');
      const input = document.getElementById('resetPin');
      const error = document.getElementById('resetError');
      if (!dialog || !input) return;

      input.value = '';
      if (error) error.hidden = true;

      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else if (window.confirm('¿Continuar con el reinicio de datos y gastos?')) {
        Actions.performReset();
        return;
      }

      if (typeof input.focus === 'function') input.focus();
    },

    confirmReset(form) {
      const pin = form.elements.namedItem('pin').value.trim();
      const error = document.getElementById('resetError');
      const dialog = document.getElementById('resetDialog');

      if (pin !== '12345') {
        if (error) {
          error.textContent = 'Clave incorrecta. Verifica e intenta nuevamente.';
          error.hidden = false;
        }
        Toast.show('Clave incorrecta.', 'error');

        const field = form.elements.namedItem('pin');
        if (typeof field.select === 'function') field.select();
        return;
      }

      if (error) error.hidden = true;
      if (dialog && typeof dialog.close === 'function') dialog.close();
      Actions.performReset();
    },

    performReset() {
      Actions.state = State.createDefault();
      Store.save(Actions.state);
      Actions.populateCategories('income', 'fixed');
      Actions.populateCategories('expense', 'fixed');
      Actions.setDefaultDates();
      Render.all();
      Toast.show('Datos y gastos reiniciados correctamente.');
    }
  };

  /* ------------------------------------------------------------
     Renderizado
     ------------------------------------------------------------ */
  const Render = {
    all() {
      Render.theme();
      Render.header();
      Render.controls();
      Render.balance();
      Render.alerts();
      Render.limits();
      Render.entries('income');
      Render.entries('expense');
      Render.goals();
      Render.emergency();
      Render.chart();
      Render.history();
    },

    theme() {
      document.body.dataset.theme = Actions.state.theme;
      document.querySelectorAll('[data-theme-option]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.themeOption === Actions.state.theme));
      });
    },

    header() {
      document.getElementById('monthChip').textContent = Utils.formatMonth(Actions.state.currentMonth);
      const isArchived = Actions.state.history.some((item) => item.month === Actions.state.currentMonth);
      document.getElementById('closeMonthBtn').disabled = isArchived;
    },

    controls() {
      const state = Actions.state;
      const limitValue = (value) => (Number(value) > 0 ? String(value) : '');

      document.getElementById('limitWeekly').value = limitValue(state.limits.weekly);
      document.getElementById('limitFortnightly').value = limitValue(state.limits.fortnightly);
      document.getElementById('limitMonthly').value = limitValue(state.limits.monthly);
      document.getElementById('emergencyAllocation').value = Calculations.configuredEmergency(state);
    },

    balance() {
      const state = Actions.state;
      const income = Calculations.monthIncome(state);
      const expenses = Calculations.monthExpenses(state);
      const goals = Calculations.goalSavedForMonth(state);
      const emergency = Calculations.effectiveEmergency(state);
      const balance = Calculations.balance(state);
      const fixedExpenses = Utils.round(state.expenses
        .filter((item) => item.month === state.currentMonth && item.type === 'fixed')
        .reduce((total, item) => total + item.amount, 0));
      const extraExpenses = Utils.round(expenses - fixedExpenses);
      const activeGoals = state.goals.filter((goal) => (
        !goal.completed && Calculations.goalProgress(goal, state).remaining > 0
      )).length;

      const amountElement = document.getElementById('balanceAmount');
      const statusElement = document.getElementById('balanceStatus');
      amountElement.textContent = Utils.formatCurrency(balance);
      amountElement.classList.toggle('is-negative', balance < 0);
      statusElement.textContent = balance < 0 ? 'Déficit' : 'Disponible';
      statusElement.classList.toggle('is-negative', balance < 0);
      document.getElementById('balanceCaption').textContent = balance < 0
        ? 'Tus gastos y metas superan los ingresos de este mes.'
        : 'Saldo tras descontar gastos, emergencias y metas del mes.';

      document.getElementById('statIncome').textContent = Utils.formatCurrency(income);
      document.getElementById('statExpenses').textContent = Utils.formatCurrency(expenses);
      document.getElementById('statEmergency').textContent = Utils.formatCurrency(emergency);
      document.getElementById('statGoals').textContent = Utils.formatCurrency(goals);
      document.getElementById('statFixedExpenses').textContent = Utils.formatCurrency(fixedExpenses);
      document.getElementById('statExtraExpenses').textContent = Utils.formatCurrency(extraExpenses);
      document.getElementById('summaryEmergencyFund').textContent = Utils.formatCurrency(state.emergencyFund);
      document.getElementById('summaryGoalCount').textContent = String(activeGoals);
    },

    alerts() {
      const state = Actions.state;
      const alerts = [];

      PERIODS.forEach((period) => {
        const status = Calculations.limitStatus(state, period.key);
        if (!status.isAlert) return;

        const percent = Math.round(status.percent);
        alerts.push({
          type: percent >= 100 ? 'danger' : 'warning',
          icon: percent >= 100 ? '!' : '⚠',
          title: `Límite ${period.label} al ${percent}%`,
          text: `Llevas ${Utils.formatCurrency(status.spent)} de ${Utils.formatCurrency(status.limit)}. Estás en la zona de alerta.`
        });
      });

      const balance = Calculations.balance(state);
      if (balance < 0) {
        alerts.push({
          type: 'danger',
          icon: '!',
          title: 'Saldo en negativo',
          text: `Debes ${Utils.formatCurrency(Math.abs(balance))} para equilibrar este mes.`
        });
      }

      if (alerts.length === 0) {
        alerts.push({
          type: 'success',
          icon: '✓',
          title: 'Todo bajo control',
          text: 'Ningún límite ha llegado al 90% y tu saldo es positivo.'
        });
      }

      document.getElementById('alertsRegion').innerHTML = alerts.map((alert) => `
        <div class="alert alert--${alert.type}">
          <span class="alert-icon alert-icon--${alert.type}" aria-hidden="true">${alert.icon}</span>
          <div>
            <strong>${Utils.escapeHtml(alert.title)}</strong>
            <p>${Utils.escapeHtml(alert.text)}</p>
          </div>
        </div>
      `).join('');
    },

    limits() {
      document.getElementById('limitsGrid').innerHTML = PERIODS.map((period) => {
        const status = Calculations.limitStatus(Actions.state, period.key);
        const bounds = Utils.getPeriodBounds(Actions.state.currentMonth, period.key);
        const barClass = status.percent >= 90
          ? 'progress-fill--danger'
          : status.percent >= 70
            ? 'progress-fill--warning'
            : '';
        const width = Math.min(100, Math.max(0, status.percent));

        return `
          <article class="limit-card">
            <div class="limit-card-head">
              <strong>${Utils.escapeHtml(period.label)}</strong>
              <span class="limit-value">${status.limit > 0 ? Utils.formatCurrency(status.limit) : 'Sin límite'}</span>
            </div>
            <div class="progress-track" aria-hidden="true">
              <div class="progress-fill ${barClass}" style="width: ${width}%"></div>
            </div>
            <div class="limit-meta">
              <span>${Utils.formatCurrency(status.spent)} · ${Utils.escapeHtml(bounds.label)}</span>
              <span>${status.limit > 0 ? `${Math.round(status.percent)}%` : '—'}</span>
            </div>
          </article>
        `;
      }).join('');
    },

    entries(kind) {
      const state = Actions.state;
      const list = kind === 'income' ? state.incomes : state.expenses;
      const label = kind === 'income' ? 'ingresos' : 'gastos';
      const targetId = kind === 'income' ? 'incomeList' : 'expenseList';

      if (list.length === 0) {
        document.getElementById(targetId).innerHTML = `<p class="empty-state">Aún no hay ${label} registrados.</p>`;
        return;
      }

      const sorted = [...list].sort((first, second) => (
        second.date.localeCompare(first.date) || second.createdAt.localeCompare(first.createdAt)
      ));

      document.getElementById(targetId).innerHTML = sorted.map((item) => `
        <div class="entry-row">
          <div class="entry-main">
            <div class="entry-title" title="${Utils.escapeHtml(item.description)}">${Utils.escapeHtml(item.description)}</div>
            <div class="entry-meta">
              <span class="pill">${item.type === 'fixed' ? 'Fijo' : 'Extra'}</span>
              <span class="pill">${Utils.escapeHtml(item.category)}</span>
              <time datetime="${Utils.escapeHtml(item.date)}">${Utils.escapeHtml(item.date)}</time>
            </div>
          </div>
          <strong class="entry-amount entry-amount--${kind}">
            ${kind === 'income' ? '+' : '−'}${Utils.formatCurrency(item.amount)}
          </strong>
          <button type="button" class="icon-btn" data-action="delete-${kind}" data-id="${Utils.escapeHtml(item.id)}" aria-label="Eliminar ${kind === 'income' ? 'ingreso' : 'gasto'}">×</button>
        </div>
      `).join('');
    },

    goals() {
      const state = Actions.state;
      if (state.goals.length === 0) {
        document.getElementById('goalList').innerHTML = '<p class="empty-state">Crea tu primera meta de ahorro.</p>';
        return;
      }

      document.getElementById('goalList').innerHTML = state.goals.map((goal) => {
        const progress = Calculations.goalProgress(goal, state);
        const monthly = Number(goal.monthlyContribution) || 0;
        const completed = progress.remaining <= 0;
        const estimate = completed
          ? 'Meta completada.'
          : monthly > 0
            ? `≈ ${Math.ceil(progress.remaining / monthly)} mes(es) con tu aporte mensual.`
            : 'Sin aporte mensual definido.';
        const percent = Math.round(progress.percent);

        return `
          <article class="goal-card">
            <div class="goal-top">
              <div class="goal-title">${Utils.escapeHtml(goal.name)}</div>
              <span class="goal-badge ${completed ? 'is-complete' : ''}">${completed ? 'Lista' : `${percent}%`}</span>
            </div>
            <p class="goal-amount">${Utils.formatCurrency(progress.saved)} de ${Utils.formatCurrency(progress.target)}</p>
            <div class="progress-track" aria-hidden="true">
              <div class="progress-fill" style="width: ${progress.percent}%"></div>
            </div>
            <p class="goal-estimate">${Utils.escapeHtml(estimate)} · Aporte mensual: ${Utils.formatCurrency(monthly)}</p>
            <form class="goal-actions goal-contribution-form" data-goal-id="${Utils.escapeHtml(goal.id)}">
              <label>
                Aporte extra
                <input name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" inputmode="decimal" ${completed ? 'disabled' : ''}>
              </label>
              <button type="submit" class="btn btn-primary" ${completed ? 'disabled' : ''}>Aportar</button>
              <button type="button" class="icon-btn goal-delete" data-action="delete-goal" data-id="${Utils.escapeHtml(goal.id)}" aria-label="Eliminar meta">×</button>
            </form>
          </article>
        `;
      }).join('');
    },

    emergency() {
      const state = Actions.state;
      const configured = Calculations.configuredEmergency(state);
      const effective = Calculations.effectiveEmergency(state);

      document.getElementById('emergencyFund').textContent = Utils.formatCurrency(state.emergencyFund);
      document.getElementById('emergencyThisMonth').textContent = Utils.formatCurrency(effective);
      document.getElementById('emergencyProjection').textContent = Utils.formatCurrency(
        Calculations.projectedEmergency(state)
      );

      if (configured > effective) {
        document.getElementById('emergencyThisMonth').title = `Configuraste ${Utils.formatCurrency(configured)}, ajustado a tu saldo disponible.`;
      } else {
        document.getElementById('emergencyThisMonth').removeAttribute('title');
      }
    },

    chart() {
      const state = Actions.state;
      const items = [
        { label: 'Ingresos', value: Calculations.monthIncome(state), tone: 'income' },
        { label: 'Gastos', value: Calculations.monthExpenses(state), tone: 'expense' },
        { label: 'Emergencia', value: Calculations.effectiveEmergency(state), tone: 'emergency' },
        { label: 'Metas', value: Calculations.goalSavedForMonth(state), tone: 'goals' },
        { label: 'Saldo', value: Calculations.balance(state), tone: 'balance' }
      ];
      const maxValue = Math.max(...items.map((item) => Math.abs(item.value)), 1);

      document.getElementById('monthChart').innerHTML = items.map((item) => {
        const height = Math.max(4, Math.round((Math.abs(item.value) / maxValue) * 100));
        return `
          <div class="chart-item">
            <div class="chart-bar-track">
              <div class="chart-bar chart-bar--${item.tone}" style="height: ${height}%"></div>
            </div>
            <span class="chart-label">
              ${Utils.escapeHtml(item.label)}
              <span>${Utils.formatCurrency(item.value)}</span>
            </span>
          </div>
        `;
      }).join('');

      const history = [...state.history].sort((first, second) => first.month.localeCompare(second.month)).slice(-6);
      const historyElement = document.getElementById('historyChart');

      if (history.length === 0) {
        historyElement.innerHTML = '<p class="empty-state">Cierra un mes para ver la comparación.</p>';
        return;
      }

      const historyMax = Math.max(...history.flatMap((item) => [item.totalIncome, item.totalExpenses]), 1);
      historyElement.innerHTML = history.map((item) => {
        const incomeHeight = Math.max(3, Math.round((item.totalIncome / historyMax) * 100));
        const expenseHeight = Math.max(3, Math.round((item.totalExpenses / historyMax) * 100));
        const [year, month] = item.month.split('-').map(Number);
        const monthName = (MONTH_NAMES[month - 1] || 'Mes').slice(0, 3);
        const label = `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${String(year).slice(-2)}`;

        return `
          <div class="history-chart-item">
            <div class="history-chart-pair">
              <div class="mini-bar mini-bar--income" style="height: ${incomeHeight}%"></div>
              <div class="mini-bar mini-bar--expense" style="height: ${expenseHeight}%"></div>
            </div>
            <span class="history-chart-label">${Utils.escapeHtml(label)}</span>
          </div>
        `;
      }).join('');
    },

    history() {
      const history = [...Actions.state.history].sort((first, second) => second.month.localeCompare(first.month));
      if (history.length === 0) {
        document.getElementById('historyList').innerHTML = '<p class="empty-state">El historial aparecerá al cerrar el primer mes.</p>';
        return;
      }

      document.getElementById('historyList').innerHTML = `
        <table class="history-table">
          <thead>
            <tr>
              <th>Mes</th>
              <th>Ingresos</th>
              <th>Gastos</th>
              <th>Emergencia</th>
              <th>Metas</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            ${history.map((item) => `
              <tr>
                <td>${Utils.escapeHtml(Utils.formatMonth(item.month))}</td>
                <td>${Utils.formatCurrency(item.totalIncome)}</td>
                <td>${Utils.formatCurrency(item.totalExpenses)}</td>
                <td>${Utils.formatCurrency(item.emergencySaved)}</td>
                <td>${Utils.formatCurrency(item.goalsSaved)}</td>
                <td>${Utils.formatCurrency(item.balance)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
  };

  /* ------------------------------------------------------------
     Arranque y enlace de eventos
     ------------------------------------------------------------ */
  const App = {
    init() {
      Actions.state = Store.load();
      const rolledOver = Cycle.rollover(Actions.state);
      Store.save(Actions.state);

      Actions.populateCategories('income', 'fixed');
      Actions.populateCategories('expense', 'fixed');
      Actions.setDefaultDates();
      Render.all();
      App.bindEvents();

      if (rolledOver) {
        Toast.show('Nuevo mes iniciado: metas y aportes actualizados.');
      }
    },

    bindEvents() {
      document.querySelectorAll('[data-theme-option]').forEach((button) => {
        button.addEventListener('click', () => Actions.setTheme(button.dataset.themeOption));
      });

      document.getElementById('incomeForm').addEventListener('submit', (event) => {
        event.preventDefault();
        Actions.addIncome(event.currentTarget);
      });

      document.getElementById('expenseForm').addEventListener('submit', (event) => {
        event.preventDefault();
        Actions.addExpense(event.currentTarget);
      });

      document.getElementById('limitsForm').addEventListener('submit', (event) => {
        event.preventDefault();
        Actions.setLimits(event.currentTarget);
      });

      document.getElementById('allocationForm').addEventListener('submit', (event) => {
        event.preventDefault();
        Actions.setAllocation(event.currentTarget);
      });

      document.getElementById('goalForm').addEventListener('submit', (event) => {
        event.preventDefault();
        Actions.addGoal(event.currentTarget);
      });

      document.getElementById('incomeType').addEventListener('change', (event) => {
        Actions.populateCategories('income', event.target.value);
      });

      document.getElementById('expenseType').addEventListener('change', (event) => {
        Actions.populateCategories('expense', event.target.value);
      });

      document.getElementById('closeMonthBtn').addEventListener('click', () => {
        Actions.closeCurrentMonth();
      });

      document.getElementById('resetForm').addEventListener('submit', (event) => {
        event.preventDefault();
        Actions.confirmReset(event.currentTarget);
      });

      document.addEventListener('click', (event) => {
        const button = event.target.closest('[data-action]');
        if (!button) return;

        const action = button.dataset.action;
        if (action === 'delete-income' || action === 'delete-expense') {
          Actions.deleteEntry(action, button.dataset.id);
        } else if (action === 'delete-goal') {
          Actions.deleteGoal(button.dataset.id);
        } else if (action === 'reset-all') {
          Actions.openResetDialog();
        } else if (action === 'cancel-reset') {
          const dialog = document.getElementById('resetDialog');
          if (dialog && typeof dialog.close === 'function') dialog.close();
        }
      });

      document.addEventListener('submit', (event) => {
        const form = event.target;
        if (!form.classList.contains('goal-contribution-form')) return;
        event.preventDefault();
        Actions.contributeToGoal(form.dataset.goalId, form);
      });
    }
  };

  document.addEventListener('DOMContentLoaded', App.init);
})();
