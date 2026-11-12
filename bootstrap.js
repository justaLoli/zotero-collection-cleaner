var chromeHandle;
var MENU_ID = 'collection-cleaner-menu';

function install() {}
function uninstall() {}

function startup({ rootURI }) {
  const aomStartup = Cc['@mozilla.org/addons/addon-manager-startup;1']
    .getService(Ci.amIAddonManagerStartup);
  chromeHandle = aomStartup.registerChrome(Services.io.newURI(rootURI + 'manifest.json'), [
    ['content', 'collection-cleaner', 'content/']
  ]);
  for (const window of Zotero.getMainWindows()) onMainWindowLoad({ window });
}

function onMainWindowLoad({ window }) {
  const doc = window.document;
  const popup = doc.getElementById('menu_ToolsPopup');
  if (!popup || doc.getElementById(MENU_ID)) return;
  const item = doc.createXULElement('menuitem');
  item.id = MENU_ID;
  item.setAttribute('label', '分类去重…');
  item.addEventListener('command', () => run(window));
  popup.appendChild(item);
}

function onMainWindowUnload({ window }) {
  window.document.getElementById(MENU_ID)?.remove();
}

function shutdown() {
  for (const window of Zotero.getMainWindows()) onMainWindowUnload({ window });
  if (chromeHandle) chromeHandle.destruct();
  chromeHandle = null;
}

function findCandidates(parent) {
  const parentIDs = new Set(parent.getChildItems(true));
  const found = new Set();
  const pending = [...parent.getChildCollections()];
  while (pending.length) {
    const child = pending.pop();
    for (const id of child.getChildItems(true)) {
      if (parentIDs.has(id)) found.add(id);
    }
    pending.push(...child.getChildCollections());
  }
  return [...found];
}

async function run(window) {
  try {
    const name = window.prompt('请输入分类的完整名称（区分大小写）：');
    if (name === null || !name.trim()) return;
    const matches = [];
    for (const library of Zotero.Libraries.getAll()) {
      if (library.libraryType === 'feed') continue;
      for (const collection of Zotero.Collections.getByLibrary(library.libraryID, true)) {
        if (collection.name === name.trim()) matches.push(collection);
      }
    }
    if (matches.length !== 1) {
      window.alert(matches.length ? '找到多个同名分类，请先将分类改为唯一名称。' : '未找到该分类。');
      return;
    }
    const parent = matches[0];
    if (!Zotero.Libraries.get(parent.libraryID).editable) {
      window.alert('该文献库不可编辑。');
      return;
    }
    const ids = findCandidates(parent);
    if (!ids.length) {
      window.alert('没有需要处理的文献。');
      return;
    }
    const titles = ids.map(id => {
      const item = Zotero.Items.get(id);
      return `${item.getDisplayTitle() || '（无标题）'}  [${item.key}]`;
    });
    const args = {
      title: `${Zotero.Libraries.get(parent.libraryID).name} / ${parent.name}`,
      titles,
      confirmed: false
    };
    window.openDialog('chrome://collection-cleaner/content/confirm.xhtml', '',
      'chrome,modal,centerscreen,resizable', args);
    if (!args.confirmed) return;
    await Zotero.DB.executeTransaction(async () => {
      // Never remove an entry that no longer satisfies the condition.
      const current = new Set(findCandidates(parent));
      if (ids.some(id => !current.has(id))) {
        throw new Error('分类内容已变化，未做任何修改；请重新运行。');
      }
      Zotero.UndoHistory.stageAction('undo-action-remove-from-collection', { count: ids.length });
      await parent.removeItems(ids);
    });
    window.alert(`完成：已从「${parent.name}」移除 ${ids.length} 条文献，子分类和文献库中的文献未被删除。`);
  } catch (error) {
    Zotero.logError(error);
    window.alert(`分类去重失败：${error.message || error}`);
  }
}
