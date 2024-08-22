import { Nostalgist } from 'nostalgist'

const func = async () => {
  const response = await window.versions.ping();
  console.log(response); // prints out 'pong'
  await Nostalgist.nes('flappybird.nes')
};

func();