// Vercel 测试函数
module.exports = (req, res) => {
  res.json({ success: true, message: 'Vercel function works!', time: new Date().toISOString() });
};
