const PmSettings = require('../../models/pm/PmSettings');

const getSettings = async () => {
  const [settings] = await PmSettings.findOrCreate({
    where: { id: 1 },
    defaults: { id: 1 },
  });
  return settings;
};

const updateSettings = async (data) => {
  const settings = await getSettings();
  Object.assign(settings, data);
  await settings.save();
  return settings;
};

module.exports = { getSettings, updateSettings };
