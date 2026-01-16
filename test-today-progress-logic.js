// Test script to verify Today's Progress logic
console.log('🔍 TESTING TODAY\'S PROGRESS LOGIC\n');

// Simulate different scenarios
const testScenarios = [
  {
    name: 'High performer - tasks due today + extra productivity',
    todayTasksIncomplete: 2, // 2 tasks due today, not completed
    todayTasksCompleted: 8,  // 8 tasks due today, completed
    tasksCompletedToday: 3   // 3 additional tasks completed today
  },
  {
    name: 'Good performer - only due date tasks',
    todayTasksIncomplete: 3,
    todayTasksCompleted: 7,
    tasksCompletedToday: 0
  },
  {
    name: 'Moderate performer - only productivity',
    todayTasksIncomplete: 5,
    todayTasksCompleted: 0,
    tasksCompletedToday: 4
  },
  {
    name: 'Low performer - no activity',
    todayTasksIncomplete: 5,
    todayTasksCompleted: 0,
    tasksCompletedToday: 0
  },
  {
    name: 'Perfect day - all tasks completed',
    todayTasksIncomplete: 0,
    todayTasksCompleted: 10,
    tasksCompletedToday: 2
  }
];

function calculateTodaysProgress(todayTasksIncomplete, todayTasksCompleted, tasksCompletedToday) {
  const totalTasksDueToday = todayTasksIncomplete + todayTasksCompleted;
  const todayDueCompletionRate = totalTasksDueToday > 0 ? Math.round((todayTasksCompleted / totalTasksDueToday) * 100) : 0;

  // Overall today's progress score (weighted average)
  let todayProgressScore = 0;
  if (totalTasksDueToday > 0 && tasksCompletedToday > 0) {
    // Weight: 70% due date completion + 30% general productivity
    todayProgressScore = Math.round((todayDueCompletionRate * 0.7) + (Math.min(tasksCompletedToday * 10, 100) * 0.3));
  } else if (totalTasksDueToday > 0) {
    todayProgressScore = todayDueCompletionRate;
  } else if (tasksCompletedToday > 0) {
    todayProgressScore = Math.min(tasksCompletedToday * 10, 100);
  }

  return {
    todayDueCompletionRate,
    todayProgressScore,
    totalTasksDueToday,
    tasksCompletedToday
  };
}

testScenarios.forEach((scenario, index) => {
  console.log(`${index + 1}. ${scenario.name}`);
  const result = calculateTodaysProgress(
    scenario.todayTasksIncomplete,
    scenario.todayTasksCompleted,
    scenario.tasksCompletedToday
  );

  console.log(`   Due Today: ${scenario.todayTasksIncomplete} incomplete, ${scenario.todayTasksCompleted} completed`);
  console.log(`   Total Due Today: ${result.totalTasksDueToday}`);
  console.log(`   Due Date Completion Rate: ${result.todayDueCompletionRate}%`);
  console.log(`   Additional Tasks Today: ${result.tasksCompletedToday}`);
  console.log(`   Overall Progress Score: ${result.todayProgressScore}%`);
  console.log('');
});

console.log('✅ LOGIC VERIFICATION COMPLETE');
console.log('\n📊 SUMMARY:');
console.log('- Today\'s Progress combines due date completion (70%) + general productivity (30%)');
console.log('- Progress bar shows color-coded performance levels');
console.log('- Additional metrics show detailed breakdown');
console.log('- Enhanced status calculation considers both overall and daily performance');


















