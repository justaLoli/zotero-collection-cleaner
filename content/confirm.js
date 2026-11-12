window.addEventListener('DOMContentLoaded', () => {
  const args = window.arguments[0];
  document.getElementById('summary').textContent = `${args.title}：共 ${args.titles.length} 条`;
  const list = document.getElementById('list');
  for (const title of args.titles) {
    const li = document.createElement('li');
    li.textContent = title;
    list.appendChild(li);
  }
  document.getElementById('cancel').addEventListener('click', () => window.close());
  document.getElementById('confirm').addEventListener('click', () => {
    args.confirmed = true;
    window.close();
  });
});
